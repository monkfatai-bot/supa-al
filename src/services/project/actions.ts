"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { dispatchEvent } from "@/services/automation/triggers";
import { createNotification } from "@/services/notification/actions";
import { hasMinimumRole } from "@/services/rbac/permissions";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import type { Role } from "@/services/rbac/types";
import { PAGINATION } from "@/config/constants";
import type {
  Project,
  ProjectMilestone,
  Task,
  TaskStatus,
  ProjectStatus,
  TaskPriority,
  ActivityAction,
} from "@/types/generated/database";
import type {
  CreateProjectRequest,
  CreateMilestoneRequest,
  CreateTaskRequest,
  UpdateTaskStatusRequest,
  ProjectWithProgress,
  TaskWithAssignee,
  ProjectDashboardStats,
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────



/**
 * Recalculate and persist the progress_percent for a project
 * based on its completed vs total tasks.
 */
async function recalcProjectProgress(
  projectId: string,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  const { count: total } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { count: completed } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "done");

  const progress =
    total && total > 0 ? Math.round(((completed ?? 0) / total) * 100) : 0;

  await supabase
    .from("projects")
    .update({ progress_percent: progress, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  return progress;
}

// ═══════════════════════════════════════════════════════════════
// PROJECT CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new project within a workspace.
 */
export async function createProject(
  data: CreateProjectRequest
): Promise<{ success: boolean; message: string; error?: string; project?: Project }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify workspace membership
  const membership = await verifyWorkspaceMembership(data.workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  // Validate name
  const trimmedName = data.name.trim();
  if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 200) {
    return { success: false, message: "Project name must be 1-200 characters.", error: "INVALID_NAME" };
  }

  const insertPayload: Record<string, unknown> = {
    workspace_id: data.workspaceId,
    name: trimmedName,
    description: data.description?.trim() ?? "",
    status: data.status ?? "planning",
    priority: data.priority ?? "medium",
    progress_percent: 0,
    tags: data.tags ?? [],
    settings: {},
    created_by: profile.id,
    start_date: data.startDate ?? null,
    end_date: data.endDate ?? null,
    budget: data.budget ?? 0,
    assigned_to: data.assignedTo ?? null,
  };

  const { data: project, error } = await supabase
    .from("projects")
    .insert(insertPayload)
    .select()
    .single();

  if (error || !project) {
    logger.error("Failed to create project", { reason: error?.message });
    return { success: false, message: "Failed to create project.", error: "CREATE_FAILED" };
  }

  logger.info("Project created", { projectId: project.id, workspaceId: data.workspaceId });
  await logActivity("project_create" as ActivityAction, `Created project: ${trimmedName}`, { projectId: project.id }, data.workspaceId);
  void dispatchEvent({ eventName: 'project.created', workspaceId: data.workspaceId, userId: profile.id, payload: { projectId: project.id, name: trimmedName }, timestamp: new Date().toISOString() }).catch(() => {});
  revalidatePath("/business");
  return { success: true, message: "Project created.", project };
}

/**
 * Update an existing project.
 */
export async function updateProject(
  projectId: string,
  workspaceId: string,
  updates: {
    name?: string;
    description?: string;
    status?: ProjectStatus;
    priority?: TaskPriority;
    startDate?: string;
    endDate?: string;
    budget?: number;
    assignedTo?: string;
    tags?: string[];
  }
): Promise<{ success: boolean; message: string; error?: string; project?: Project }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 200) {
      return { success: false, message: "Project name must be 1-200 characters.", error: "INVALID_NAME" };
    }
    dbUpdates.name = trimmed;
  }
  if (updates.description !== undefined) dbUpdates.description = updates.description.trim();
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.budget !== undefined) dbUpdates.budget = updates.budget;
  if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;

  if (Object.keys(dbUpdates).length <= 1) {
    return { success: false, message: "No valid fields to update.", error: "NO_UPDATES" };
  }

  const { data: project, error } = await supabase
    .from("projects")
    .update(dbUpdates)
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error || !project) {
    logger.error("Failed to update project", { projectId, reason: error?.message });
    return { success: false, message: "Failed to update project.", error: "UPDATE_FAILED" };
  }

  logger.info("Project updated", { projectId });
  await logActivity("project_update" as ActivityAction, `Updated project: ${project.name}`, { projectId }, workspaceId);
  revalidatePath("/business");
  return { success: true, message: "Project updated.", project };
}

/**
 * Delete a project and its associated milestones and tasks.
 */
export async function deleteProject(
  projectId: string,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  // Verify project exists in this workspace
  const { data: existing } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!existing) {
    return { success: false, message: "Project not found.", error: "NOT_FOUND" };
  }

  // Delete tasks first, then milestones, then project (cascade would handle this but be explicit)
  await supabase.from("tasks").delete().eq("project_id", projectId);
  await supabase.from("project_milestones").delete().eq("project_id", projectId);

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to delete project", { projectId, reason: error.message });
    return { success: false, message: "Failed to delete project.", error: "DELETE_FAILED" };
  }

  logger.info("Project deleted", { projectId, workspaceId });
  await logActivity("project_delete" as ActivityAction, `Deleted project: ${existing.name}`, { projectId }, workspaceId);
  revalidatePath("/business");
  return { success: true, message: "Project deleted." };
}

/**
 * List projects for a workspace with optional filters and pagination.
 */
export async function getProjects(
  workspaceId: string,
  filters?: {
    page?: number;
    pageSize?: number;
    status?: ProjectStatus;
    assignedTo?: string;
    search?: string;
  }
): Promise<{
  projects: ProjectWithProgress[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { projects: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters?.page ?? 1;
  const pageSize = Math.min(
    filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE,
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("projects")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.assignedTo) {
    query = query.eq("assigned_to", filters.assignedTo);
  }
  if (filters?.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }

  query = query.order("updated_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;

  if (error || !data) {
    logger.error("Failed to fetch projects", { reason: error?.message });
    return { projects: [], total: 0, page, pageSize };
  }

  // Enrich with task counts
  const projectsWithProgress: ProjectWithProgress[] = await Promise.all(
    data.map(async (p) => {
      const { count: totalTasks } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", p.id);

      const { count: completedTasks } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", p.id)
        .eq("status", "done");

      return {
        ...p,
        taskCount: totalTasks ?? 0,
        completedTaskCount: completedTasks ?? 0,
      };
    })
  );

  return { projects: projectsWithProgress, total: count ?? 0, page, pageSize };
}

/**
 * Get a single project by ID with milestones and task counts.
 */
export async function getProject(
  projectId: string
): Promise<{ success: boolean; message: string; error?: string; project?: ProjectWithProgress }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return { success: false, message: "Project not found.", error: "NOT_FOUND" };
  }

  // Verify membership
  const membership = await verifyWorkspaceMembership(project.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Get milestones
  const { data: milestones } = await supabase
    .from("project_milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  // Get task counts
  const { count: totalTasks } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { count: completedTasks } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "done");

  const projectWithProgress: ProjectWithProgress = {
    ...project,
    taskCount: totalTasks ?? 0,
    completedTaskCount: completedTasks ?? 0,
    milestones: milestones ?? [],
  };

  return { success: true, message: "Project retrieved.", project: projectWithProgress };
}

/**
 * Recalculate and persist the progress for a project.
 * Returns the updated project.
 */
export async function updateProjectProgress(
  projectId: string
): Promise<{ success: boolean; message: string; error?: string; progress?: number }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify project exists and user has access
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id, name")
    .eq("id", projectId)
    .single();

  if (!project) {
    return { success: false, message: "Project not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(project.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const progress = await recalcProjectProgress(projectId, supabase);

  logger.info("Project progress recalculated", { projectId, progress });
  revalidatePath("/business");
  return { success: true, message: "Progress updated.", progress };
}

// ═══════════════════════════════════════════════════════════════
// MILESTONE CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new milestone within a project.
 */
export async function createMilestone(
  data: CreateMilestoneRequest
): Promise<{ success: boolean; message: string; error?: string; milestone?: ProjectMilestone }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify project exists and user has workspace access
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", data.projectId)
    .single();

  if (!project) {
    return { success: false, message: "Project not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(project.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const trimmedName = data.name.trim();
  if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 200) {
    return { success: false, message: "Milestone name must be 1-200 characters.", error: "INVALID_NAME" };
  }

  // Determine sort order
  let sortOrder = data.sortOrder;
  if (sortOrder === undefined) {
    const { count: existingCount } = await supabase
      .from("project_milestones")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId);
    sortOrder = (existingCount ?? 0) + 1;
  }

  const { data: milestone, error } = await supabase
    .from("project_milestones")
    .insert({
      project_id: data.projectId,
      name: trimmedName,
      description: data.description?.trim() ?? "",
      due_date: data.dueDate ?? null,
      sort_order: sortOrder,
      status: "todo" as TaskStatus,
    })
    .select()
    .single();

  if (error || !milestone) {
    logger.error("Failed to create milestone", { reason: error?.message });
    return { success: false, message: "Failed to create milestone.", error: "CREATE_FAILED" };
  }

  logger.info("Milestone created", { milestoneId: milestone.id, projectId: data.projectId });
  await logActivity("milestone_create" as ActivityAction, `Created milestone: ${trimmedName}`, { milestoneId: milestone.id, projectId: data.projectId }, project.workspace_id);
  revalidatePath("/business");
  return { success: true, message: "Milestone created.", milestone };
}

/**
 * Update a milestone.
 */
export async function updateMilestone(
  milestoneId: string,
  updates: {
    name?: string;
    description?: string;
    dueDate?: string;
    sortOrder?: number;
  }
): Promise<{ success: boolean; message: string; error?: string; milestone?: ProjectMilestone }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Get milestone with project
  const { data: existing } = await supabase
    .from("project_milestones")
    .select("id, project_id, project:projects!inner(id, workspace_id)")
    .eq("id", milestoneId)
    .single();

  if (!existing) {
    return { success: false, message: "Milestone not found.", error: "NOT_FOUND" };
  }

  const projectRow = existing.project as unknown as { id: string; workspace_id: string };
  const membership = await verifyWorkspaceMembership(projectRow.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 200) {
      return { success: false, message: "Milestone name must be 1-200 characters.", error: "INVALID_NAME" };
    }
    dbUpdates.name = trimmed;
  }
  if (updates.description !== undefined) dbUpdates.description = updates.description.trim();
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

  if (Object.keys(dbUpdates).length <= 1) {
    return { success: false, message: "No valid fields to update.", error: "NO_UPDATES" };
  }

  const { data: milestone, error } = await supabase
    .from("project_milestones")
    .update(dbUpdates)
    .eq("id", milestoneId)
    .select()
    .single();

  if (error || !milestone) {
    logger.error("Failed to update milestone", { milestoneId, reason: error?.message });
    return { success: false, message: "Failed to update milestone.", error: "UPDATE_FAILED" };
  }

  logger.info("Milestone updated", { milestoneId });
  await logActivity("milestone_update" as ActivityAction, `Updated milestone: ${milestone.name}`, { milestoneId }, projectRow.workspace_id);
  revalidatePath("/business");
  return { success: true, message: "Milestone updated.", milestone };
}

/**
 * Delete a milestone.
 */
export async function deleteMilestone(
  milestoneId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("project_milestones")
    .select("id, project_id, name")
    .eq("id", milestoneId)
    .single();

  if (!existing) {
    return { success: false, message: "Milestone not found.", error: "NOT_FOUND" };
  }

  // Get workspace via project
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", existing.project_id)
    .single();

  if (!project) {
    return { success: false, message: "Associated project not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(project.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  // Unlink tasks from this milestone
  await supabase
    .from("tasks")
    .update({ milestone_id: null, updated_at: new Date().toISOString() })
    .eq("milestone_id", milestoneId);

  const { error } = await supabase
    .from("project_milestones")
    .delete()
    .eq("id", milestoneId);

  if (error) {
    logger.error("Failed to delete milestone", { milestoneId, reason: error.message });
    return { success: false, message: "Failed to delete milestone.", error: "DELETE_FAILED" };
  }

  logger.info("Milestone deleted", { milestoneId });
  await logActivity("milestone_delete" as ActivityAction, `Deleted milestone: ${existing.name}`, { milestoneId }, project.workspace_id);
  revalidatePath("/business");
  return { success: true, message: "Milestone deleted." };
}

/**
 * Get all milestones for a project.
 */
export async function getMilestones(
  projectId: string
): Promise<ProjectMilestone[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", projectId)
    .single();

  if (!project) return [];

  const membership = await verifyWorkspaceMembership(project.workspace_id, profile.id);
  if (!membership) return [];

  const { data, error } = await supabase
    .from("project_milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    logger.error("Failed to fetch milestones", { projectId, reason: error?.message });
    return [];
  }

  return data;
}

/**
 * Update the status of a milestone.
 */
export async function updateMilestoneStatus(
  milestoneId: string,
  status: TaskStatus
): Promise<{ success: boolean; message: string; error?: string; milestone?: ProjectMilestone }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("project_milestones")
    .select("id, project_id, name")
    .eq("id", milestoneId)
    .single();

  if (!existing) {
    return { success: false, message: "Milestone not found.", error: "NOT_FOUND" };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", existing.project_id)
    .single();

  if (!project) {
    return { success: false, message: "Associated project not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(project.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: milestone, error } = await supabase
    .from("project_milestones")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", milestoneId)
    .select()
    .single();

  if (error || !milestone) {
    logger.error("Failed to update milestone status", { milestoneId, reason: error?.message });
    return { success: false, message: "Failed to update milestone status.", error: "UPDATE_FAILED" };
  }

  logger.info("Milestone status updated", { milestoneId, status });
  await logActivity("milestone_status_change" as ActivityAction, `Milestone '${existing.name}' status changed to ${status}`, { milestoneId, status }, project.workspace_id);
  revalidatePath("/business");
  return { success: true, message: "Milestone status updated.", milestone };
}

// ═══════════════════════════════════════════════════════════════
// TASK CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new task.
 */
export async function createTask(
  data: CreateTaskRequest
): Promise<{ success: boolean; message: string; error?: string; task?: Task }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(data.workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const trimmedTitle = data.title.trim();
  if (!trimmedTitle || trimmedTitle.length < 1 || trimmedTitle.length > 500) {
    return { success: false, message: "Task title must be 1-500 characters.", error: "INVALID_TITLE" };
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: data.workspaceId,
      project_id: data.projectId ?? null,
      milestone_id: data.milestoneId ?? null,
      title: trimmedTitle,
      description: data.description?.trim() ?? "",
      status: data.status ?? ("todo" as TaskStatus),
      priority: data.priority ?? ("medium" as TaskPriority),
      assignee_id: data.assigneeId ?? null,
      due_date: data.dueDate ?? null,
      tags: data.tags ?? [],
      created_by: profile.id,
      started_at: data.status === "in_progress" ? new Date().toISOString() : null,
      completed_at: data.status === "done" ? new Date().toISOString() : null,
      sort_order: 0,
    })
    .select()
    .single();

  if (error || !task) {
    logger.error("Failed to create task", { reason: error?.message });
    return { success: false, message: "Failed to create task.", error: "CREATE_FAILED" };
  }

  // Recalculate project progress if task belongs to a project
  if (task.project_id) {
    await recalcProjectProgress(task.project_id, supabase);
  }

  logger.info("Task created", { taskId: task.id, workspaceId: data.workspaceId });
  await logActivity("task_create" as ActivityAction, `Created task: ${trimmedTitle}`, { taskId: task.id }, data.workspaceId);
  void dispatchEvent({ eventName: 'task.created', workspaceId: data.workspaceId, userId: profile.id, payload: { taskId: task.id, projectId: task.project_id }, timestamp: new Date().toISOString() }).catch(() => {});
  revalidatePath("/business");
  return { success: true, message: "Task created.", task };
}

/**
 * Update a task's editable fields.
 */
export async function updateTask(
  taskId: string,
  workspaceId: string,
  updates: {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: string;
    projectId?: string;
    milestoneId?: string;
    tags?: string[];
    sortOrder?: number;
  }
): Promise<{ success: boolean; message: string; error?: string; task?: Task }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  // Verify task exists in this workspace
  const { data: existing } = await supabase
    .from("tasks")
    .select("id, project_id")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!existing) {
    return { success: false, message: "Task not found.", error: "NOT_FOUND" };
  }

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.title !== undefined) {
    const trimmed = updates.title.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 500) {
      return { success: false, message: "Task title must be 1-500 characters.", error: "INVALID_TITLE" };
    }
    dbUpdates.title = trimmed;
  }
  if (updates.description !== undefined) dbUpdates.description = updates.description.trim();
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId;
  if (updates.milestoneId !== undefined) dbUpdates.milestone_id = updates.milestoneId;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

  if (Object.keys(dbUpdates).length <= 1) {
    return { success: false, message: "No valid fields to update.", error: "NO_UPDATES" };
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .update(dbUpdates)
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error || !task) {
    logger.error("Failed to update task", { taskId, reason: error?.message });
    return { success: false, message: "Failed to update task.", error: "UPDATE_FAILED" };
  }

  // Recalculate project progress if task belongs to a project (or moved)
  const projectId = task.project_id ?? existing.project_id;
  if (projectId) {
    await recalcProjectProgress(projectId, supabase);
  }

  logger.info("Task updated", { taskId });
  await logActivity("task_update" as ActivityAction, `Updated task: ${task.title}`, { taskId }, workspaceId);
  revalidatePath("/business");
  return { success: true, message: "Task updated.", task };
}

/**
 * Delete a task.
 */
export async function deleteTask(
  taskId: string,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, project_id, title")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!existing) {
    return { success: false, message: "Task not found.", error: "NOT_FOUND" };
  }

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to delete task", { taskId, reason: error.message });
    return { success: false, message: "Failed to delete task.", error: "DELETE_FAILED" };
  }

  // Recalculate project progress
  if (existing.project_id) {
    await recalcProjectProgress(existing.project_id, supabase);
  }

  logger.info("Task deleted", { taskId, workspaceId });
  await logActivity("task_delete" as ActivityAction, `Deleted task: ${existing.title}`, { taskId }, workspaceId);
  revalidatePath("/business");
  return { success: true, message: "Task deleted." };
}

/**
 * List tasks for a workspace with optional filters and pagination.
 */
export async function getTasks(
  workspaceId: string,
  filters?: {
    page?: number;
    pageSize?: number;
    projectId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string;
    dueBefore?: string;
  }
): Promise<{
  tasks: TaskWithAssignee[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { tasks: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters?.page ?? 1;
  const pageSize = Math.min(
    filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE,
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("tasks")
    .select("*, assignee:profiles!tasks_assignee_id_fkey(full_name, avatar_url), project:projects!tasks_project_id_fkey(name)", { count: "exact" })
    .eq("workspace_id", workspaceId);

  if (filters?.projectId) {
    query = query.eq("project_id", filters.projectId);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.priority) {
    query = query.eq("priority", filters.priority);
  }
  if (filters?.assigneeId) {
    query = query.eq("assignee_id", filters.assigneeId);
  }
  if (filters?.dueBefore) {
    query = query.lte("due_date", filters.dueBefore);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;

  if (error || !data) {
    logger.error("Failed to fetch tasks", { reason: error?.message });
    return { tasks: [], total: 0, page, pageSize };
  }

  const tasksWithAssignee: TaskWithAssignee[] = data.map((t) => {
    const assigneeRaw = t.assignee as unknown as { full_name: string | null; avatar_url: string | null } | null;
    const projectRaw = t.project as unknown as { name: string } | null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { assignee, project, ...taskFields } = t;

    return {
      ...taskFields,
      assignee: assigneeRaw ? { full_name: assigneeRaw.full_name, avatar_url: assigneeRaw.avatar_url } : undefined,
      project: projectRaw ? { name: projectRaw.name } : undefined,
    } as TaskWithAssignee;
  });

  return { tasks: tasksWithAssignee, total: count ?? 0, page, pageSize };
}

/**
 * Get a single task with assignee info.
 */
export async function getTask(
  taskId: string
): Promise<{ success: boolean; message: string; error?: string; task?: TaskWithAssignee }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*, assignee:profiles!tasks_assignee_id_fkey(full_name, avatar_url), project:projects!tasks_project_id_fkey(name)")
    .eq("id", taskId)
    .single();

  if (error || !data) {
    return { success: false, message: "Task not found.", error: "NOT_FOUND" };
  }

  // Verify workspace membership
  const membership = await verifyWorkspaceMembership(data.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const assigneeRaw = data.assignee as unknown as { full_name: string | null; avatar_url: string | null } | null;
  const projectRaw = data.project as unknown as { name: string } | null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { assignee, project, ...taskFields } = data;

  const taskWithAssignee: TaskWithAssignee = {
    ...taskFields,
    assignee: assigneeRaw ? { full_name: assigneeRaw.full_name, avatar_url: assigneeRaw.avatar_url } : undefined,
    project: projectRaw ? { name: projectRaw.name } : undefined,
  } as TaskWithAssignee;

  return { success: true, message: "Task retrieved.", task: taskWithAssignee };
}

/**
 * Update a task's status. Automatically sets started_at or completed_at.
 */
export async function updateTaskStatus(
  taskId: string,
  workspaceId: string,
  statusData: UpdateTaskStatusRequest
): Promise<{ success: boolean; message: string; error?: string; task?: Task }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, project_id, title, status, started_at")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!existing) {
    return { success: false, message: "Task not found.", error: "NOT_FOUND" };
  }

  const dbUpdates: Record<string, unknown> = {
    status: statusData.status,
    updated_at: new Date().toISOString(),
  };

  // Auto-set timestamps based on status
  if (statusData.status === "done") {
    dbUpdates.completed_at = statusData.completedAt ?? new Date().toISOString();
    if (!existing.started_at) {
      dbUpdates.started_at = statusData.startedAt ?? new Date().toISOString();
    }
  } else if (statusData.status === "in_progress") {
    dbUpdates.started_at = statusData.startedAt ?? new Date().toISOString();
    // Clear completed_at if moving away from done
    if (existing.status === "done") {
      dbUpdates.completed_at = null;
    }
  } else if (statusData.status === "todo") {
    // Reset timestamps when going back to todo
    dbUpdates.started_at = null;
    dbUpdates.completed_at = null;
  } else {
    // in_review, cancelled — keep existing timestamps unless explicitly provided
    if (statusData.startedAt !== undefined) dbUpdates.started_at = statusData.startedAt;
    if (statusData.completedAt !== undefined) dbUpdates.completed_at = statusData.completedAt;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .update(dbUpdates)
    .eq("id", taskId)
    .select()
    .single();

  if (error || !task) {
    logger.error("Failed to update task status", { taskId, reason: error?.message });
    return { success: false, message: "Failed to update task status.", error: "UPDATE_FAILED" };
  }

  // Recalculate project progress
  if (task.project_id) {
    await recalcProjectProgress(task.project_id, supabase);
  }

  logger.info("Task status updated", { taskId, status: statusData.status });
  await logActivity("task_status_change" as ActivityAction, `Task '${task.title}' status changed to ${statusData.status}`, { taskId, status: statusData.status }, workspaceId);
  void dispatchEvent({ eventName: 'task.status_changed', workspaceId, userId: profile.id, payload: { taskId, newStatus: statusData.status }, timestamp: new Date().toISOString() }).catch(() => {});
  if (statusData.status === 'done') {
    let projectName = '';
    if (task.project_id) {
      const { data: proj } = await supabase.from('projects').select('name').eq('id', task.project_id).single();
      if (proj) projectName = (proj as unknown as { name: string }).name;
    }
    void createNotification(profile.id, 'success', 'Task Completed', `${task.title} completed${projectName ? ` in project ${projectName}` : ''}`, '/business/projects').catch(() => {});
  }
  revalidatePath("/business");
  return { success: true, message: "Task status updated.", task };
}

/**
 * Update the assignee of a task.
 */
export async function updateTaskAssignee(
  taskId: string,
  workspaceId: string,
  assigneeId: string | null
): Promise<{ success: boolean; message: string; error?: string; task?: Task }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, title, project_id")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!existing) {
    return { success: false, message: "Task not found.", error: "NOT_FOUND" };
  }

  // If assignee is set, verify they are a workspace member
  if (assigneeId) {
    const { data: assigneeMember } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", assigneeId)
      .single();

    if (!assigneeMember) {
      return { success: false, message: "Assignee is not a member of this workspace.", error: "INVALID_ASSIGNEE" };
    }
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .update({
      assignee_id: assigneeId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select()
    .single();

  if (error || !task) {
    logger.error("Failed to update task assignee", { taskId, reason: error?.message });
    return { success: false, message: "Failed to update task assignee.", error: "UPDATE_FAILED" };
  }

  logger.info("Task assignee updated", { taskId, assigneeId });
  await logActivity("task_assignee_change" as ActivityAction, `Task '${existing.title}' assigned to ${assigneeId ?? "unassigned"}`, { taskId, assigneeId }, workspaceId);
  revalidatePath("/business");
  return { success: true, message: "Task assignee updated.", task };
}

/**
 * Move a task — change status, project, milestone, or sort order.
 */
export async function moveTask(
  taskId: string,
  workspaceId: string,
  move: {
    status?: TaskStatus;
    projectId?: string;
    milestoneId?: string;
    sortOrder?: number;
  }
): Promise<{ success: boolean; message: string; error?: string; task?: Task }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, title, project_id, status, started_at")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!existing) {
    return { success: false, message: "Task not found.", error: "NOT_FOUND" };
  }

  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (move.status !== undefined) {
    dbUpdates.status = move.status;
    if (move.status === "done") {
      dbUpdates.completed_at = new Date().toISOString();
      if (!existing.started_at) dbUpdates.started_at = new Date().toISOString();
    } else if (move.status === "in_progress" && !existing.started_at) {
      dbUpdates.started_at = new Date().toISOString();
    }
  }
  if (move.projectId !== undefined) dbUpdates.project_id = move.projectId;
  if (move.milestoneId !== undefined) dbUpdates.milestone_id = move.milestoneId;
  if (move.sortOrder !== undefined) dbUpdates.sort_order = move.sortOrder;

  if (Object.keys(dbUpdates).length <= 1) {
    return { success: false, message: "No valid fields to move.", error: "NO_UPDATES" };
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .update(dbUpdates)
    .eq("id", taskId)
    .select()
    .single();

  if (error || !task) {
    logger.error("Failed to move task", { taskId, reason: error?.message });
    return { success: false, message: "Failed to move task.", error: "UPDATE_FAILED" };
  }

  // Recalculate progress for both old and new projects
  const projectsToRecalc = new Set<string>();
  if (existing.project_id) projectsToRecalc.add(existing.project_id);
  if (task.project_id && task.project_id !== existing.project_id) {
    projectsToRecalc.add(task.project_id);
  }
  for (const pid of projectsToRecalc) {
    await recalcProjectProgress(pid, supabase);
  }

  logger.info("Task moved", { taskId, move });
  await logActivity("task_move" as ActivityAction, `Moved task: ${existing.title}`, { taskId, ...move }, workspaceId);
  revalidatePath("/business");
  return { success: true, message: "Task moved.", task };
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

/**
 * Get project dashboard stats for a workspace.
 */
export async function getProjectDashboard(
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string; stats?: ProjectDashboardStats }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Active projects count (status = 'active')
  const { count: activeProjects } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  // Total tasks
  const { count: totalTasks } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // Completed tasks
  const { count: completedTasks } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "done");

  // Overdue tasks: due_date < now AND status != 'done' AND status != 'cancelled'
  const now = new Date().toISOString();
  const { count: overdueTasks } = await supabase
    .from("tasks")
    .select("id", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .neq("status", "done")
    .neq("status", "cancelled")
    .not("due_date", "is", null)
    .lt("due_date", now);

  // Upcoming deadlines: tasks due within 7 days, not done
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: upcomingData } = await supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "done")
    .neq("status", "cancelled")
    .not("due_date", "is", null)
    .gte("due_date", now)
    .lte("due_date", sevenDaysFromNow)
    .order("due_date", { ascending: true })
    .limit(10);

  const stats: ProjectDashboardStats = {
    activeProjects: activeProjects ?? 0,
    totalTasks: totalTasks ?? 0,
    completedTasks: completedTasks ?? 0,
    overdueTasks: overdueTasks ?? 0,
    upcomingDeadlines: (upcomingData ?? []) as unknown as Task[],
  };

  return { success: true, message: "Dashboard stats retrieved.", stats };
}
