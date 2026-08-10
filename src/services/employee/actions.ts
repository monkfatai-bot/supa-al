"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { hasMinimumRole } from "@/services/rbac/permissions";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import type { Role } from "@/services/rbac/types";
import { createNotification } from "@/services/notification/actions";
import { PAGINATION } from "@/config/constants";
import type {
  AiEmployee,
  EmployeeSkill,
  EmployeeMemory,
  EmployeeMessage,
  EmployeeMarketplace,
  EmployeeStatus,
  EmployeeMemoryScope,
  EmployeeTrainingType,
  EmployeeTrainingStatus,
  EmployeePerformance,
  EmployeeTraining,
  ActivityAction,
} from "@/types/generated/database";
import type {
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  AddSkillRequest,
  AddMemoryRequest,
  AddTrainingRequest,
  RecordPerformanceMetrics,
  EmployeeWithSkills,
  EmployeeFullProfile,
  EmployeeListOptions,
  EmployeeDirectoryOptions,
  MarketplaceListOptions,
  EmployeeDashboardStats,
  PaginatedEmployeeResponse,
  EmployeeActionResponse,
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────



// ═══════════════════════════════════════════════════════════════
// EMPLOYEE CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new AI employee.
 */
export async function createEmployee(
  data: CreateEmployeeRequest,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string; employee?: AiEmployee }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };
  }

  const trimmedName = data.name.trim();
  if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 255) {
    return { success: false, message: "Employee name must be 1-255 characters.", error: "INVALID_NAME" };
  }

  const insertPayload: Record<string, unknown> = {
    workspace_id: workspaceId,
    name: trimmedName,
    role: data.role?.trim() ?? "",
    department: data.department?.trim() ?? "",
    description: data.description?.trim() ?? null,
    bio: data.bio?.trim() ?? null,
    skills: data.skills ?? [],
    responsibilities: data.responsibilities ?? [],
    experience_level: data.experience_level ?? "mid",
    avatar_url: data.avatar_url ?? null,
    tags: data.tags ?? [],
    created_by: profile.id,
  };

  const { data: employee, error } = await supabase
    .from("ai_employees")
    .insert(insertPayload)
    .select()
    .single();

  if (error || !employee) {
    logger.error("Failed to create AI employee", { reason: error?.message });
    return { success: false, message: "Failed to create AI employee.", error: "CREATE_FAILED" };
  }

  logger.info("AI employee created", { employeeId: employee.id, workspaceId });
  await logActivity(
    "employee_create" as ActivityAction,
    `Created AI employee: ${trimmedName}`,
    { employeeId: employee.id },
    workspaceId
  );
  revalidatePath("/employees");
  return { success: true, message: "AI employee created.", employee };
}

/**
 * Update an existing AI employee.
 */
export async function updateEmployee(
  id: string,
  data: UpdateEmployeeRequest,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string; employee?: AiEmployee }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };
  }

  const updatePayload: Record<string, unknown> = { ...data };
  if (data.name !== undefined) updatePayload.name = data.name.trim();

  const { data: employee, error } = await supabase
    .from("ai_employees")
    .update(updatePayload)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error || !employee) {
    logger.error("Failed to update AI employee", { reason: error?.message });
    return { success: false, message: "Failed to update AI employee.", error: "UPDATE_FAILED" };
  }

  await logActivity(
    "employee_update" as ActivityAction,
    `Updated AI employee: ${employee.name}`,
    { employeeId: id },
    workspaceId
  );
  revalidatePath("/employees");
  return { success: true, message: "AI employee updated.", employee };
}

/**
 * Delete an AI employee (admin only).
 */
export async function deleteEmployee(
  id: string,
  workspaceId: string
): Promise<EmployeeActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) {
    return { success: false, message: "Admin access required.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("ai_employees")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to delete AI employee", { reason: error?.message });
    return { success: false, message: "Failed to delete AI employee.", error: "DELETE_FAILED" };
  }

  await logActivity(
    "employee_delete" as ActivityAction,
    `Deleted AI employee`,
    { employeeId: id },
    workspaceId
  );
  revalidatePath("/employees");
  return { success: true, message: "AI employee deleted." };
}

/**
 * Archive an AI employee.
 */
export async function archiveEmployee(
  id: string,
  workspaceId: string
): Promise<EmployeeActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) {
    return { success: false, message: "Admin access required.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("ai_employees")
    .update({ status: "archived" as EmployeeStatus })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to archive AI employee", { reason: error?.message });
    return { success: false, message: "Failed to archive AI employee.", error: "UPDATE_FAILED" };
  }

  await logActivity(
    "employee_archive" as ActivityAction,
    `Archived AI employee`,
    { employeeId: id },
    workspaceId
  );
  revalidatePath("/employees");
  return { success: true, message: "AI employee archived." };
}

/**
 * Deep clone an AI employee with skills.
 */
export async function cloneEmployee(
  id: string,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string; employee?: AiEmployee }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };
  }

  // Get original employee
  const { data: original, error: fetchError } = await supabase
    .from("ai_employees")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !original) {
    return { success: false, message: "Employee not found.", error: "NOT_FOUND" };
  }

  // Get original skills
  const { data: originalSkills } = await supabase
    .from("employee_skills")
    .select("*")
    .eq("employee_id", id);

  // Create clone
  const { name, role, department, description, bio, skills, responsibilities, supported_tools, permissions, experience_level, avatar_url, tags, metadata } = original;
  const { data: cloned, error: cloneError } = await supabase
    .from("ai_employees")
    .insert({
      workspace_id: workspaceId,
      name: `${name} (Copy)`,
      role,
      department,
      description,
      bio,
      skills,
      responsibilities,
      supported_tools,
      permissions,
      experience_level,
      avatar_url,
      tags,
      metadata,
      status: "active" as EmployeeStatus,
      created_by: profile.id,
    })
    .select()
    .single();

  if (cloneError || !cloned) {
    logger.error("Failed to clone AI employee", { reason: cloneError?.message });
    return { success: false, message: "Failed to clone AI employee.", error: "CLONE_FAILED" };
  }

  // Clone skills
  if (originalSkills && originalSkills.length > 0) {
    await supabase.from("employee_skills").insert(
      originalSkills.map((s) => ({
        employee_id: cloned.id,
        skill_name: s.skill_name,
        skill_category: s.skill_category,
        proficiency_level: s.proficiency_level,
        is_active: s.is_active,
        metadata: s.metadata,
      }))
    );
  }

  await logActivity(
    "employee_clone" as ActivityAction,
    `Cloned AI employee: ${name}`,
    { employeeId: cloned.id, sourceId: id },
    workspaceId
  );
  revalidatePath("/employees");
  return { success: true, message: "AI employee cloned.", employee: cloned };
}

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get paginated employee list with filters.
 */
export async function getEmployees(
  workspaceId: string,
  options?: EmployeeListOptions
): Promise<PaginatedEmployeeResponse<AiEmployee> | { error: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { error: "Access denied." };
  }

  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("ai_employees")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.department && options.department !== "all") {
    query = query.eq("department", options.department);
  }
  if (options?.search) {
    query = query.ilike("name", `%${options.search}%`);
  }
  if (options?.sort === "name_asc") {
    query = query.order("name", { ascending: true });
  } else if (options?.sort === "name_desc") {
    query = query.order("name", { ascending: false });
  } else if (options?.sort === "rating") {
    query = query.order("performance_rating", { ascending: false });
  } else if (options?.sort === "created") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error, count } = await query
    .range(from, to);

  if (error) {
    logger.error("Failed to fetch employees", { reason: error.message });
    return { error: "Failed to fetch employees." };
  }

  return {
    data: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Get a single employee with skills.
 */
export async function getEmployee(
  id: string
): Promise<{ employee?: EmployeeWithSkills; error?: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: employee, error } = await supabase
    .from("ai_employees")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !employee) {
    return { error: "Employee not found." };
  }

  const { data: skills } = await supabase
    .from("employee_skills")
    .select("*")
    .eq("employee_id", id);

  return {
    employee: {
      employee,
      skills: skills ?? [],
    },
  };
}

/**
 * Get full employee profile with skills, assignments, performance.
 */
export async function getEmployeeProfile(
  id: string
): Promise<{ profile?: EmployeeFullProfile; error?: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: employee, error } = await supabase
    .from("ai_employees")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !employee) {
    return { error: "Employee not found." };
  }

  const [skillsRes, assignmentsRes, performanceRes, deptsRes] = await Promise.all([
    supabase.from("employee_skills").select("*").eq("employee_id", id),
    supabase.from("employee_assignments").select("*").eq("employee_id", id).order("started_at", { ascending: false }).limit(20),
    supabase.from("employee_performance").select("*").eq("employee_id", id).order("period_start", { ascending: false }).limit(10),
    supabase.from("employee_departments").select("*").eq("workspace_id", employee.workspace_id),
  ]);

  return {
    profile: {
      employee,
      skills: skillsRes.data ?? [],
      assignments: assignmentsRes.data ?? [],
      performance: performanceRes.data ?? [],
      departments: deptsRes.data ?? [],
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════

/**
 * Hire/assign an employee to a project or task.
 */
export async function hireEmployee(
  employeeId: string,
  workspaceId: string,
  projectId?: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error } = await supabase.from("employee_assignments").insert({
    employee_id: employeeId,
    workspace_id: workspaceId,
    project_id: projectId ?? null,
    assignment_type: projectId ? "project" : "task",
    status: "active",
  });

  if (error) {
    logger.error("Failed to hire employee", { reason: error?.message });
    return { success: false, message: "Failed to assign employee.", error: "ASSIGN_FAILED" };
  }

  await logActivity(
    "employee_hire" as ActivityAction,
    `Hired AI employee for ${projectId ? "project" : "task"}`,
    { employeeId, projectId },
    workspaceId
  );
  void createNotification(profile.id, "employee", "Employee onboarded", `AI employee assigned to ${projectId ? "project" : "task"}`, "/employees");
  revalidatePath("/employees");
  return { success: true, message: "Employee assigned successfully." };
}

/**
 * Update employee status.
 */
export async function updateEmployeeStatus(
  id: string,
  status: EmployeeStatus,
  workspaceId: string
): Promise<EmployeeActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("ai_employees")
    .update({ status })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to update employee status", { reason: error?.message });
    return { success: false, message: "Failed to update status.", error: "UPDATE_FAILED" };
  }

  void createNotification(profile.id, "employee", "Employee status updated", `Employee status changed to ${status}`, "/employees");
  revalidatePath("/employees");
  return { success: true, message: "Status updated." };
}

// ═══════════════════════════════════════════════════════════════
// DIRECTORY & DASHBOARD
// ═══════════════════════════════════════════════════════════════

/**
 * Get employee directory view data.
 */
export async function getEmployeeDirectory(
  workspaceId: string,
  options?: EmployeeDirectoryOptions
): Promise<PaginatedEmployeeResponse<EmployeeWithSkills> | { error: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { error: "Access denied." };
  }

  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 12;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("ai_employees")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .neq("status", "archived");

  if (options?.department && options.department !== "all") {
    query = query.eq("department", options.department);
  }
  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,role.ilike.%${options.search}%,department.ilike.%${options.search}%`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch employee directory", { reason: error.message });
    return { error: "Failed to fetch employees." };
  }

  // Fetch skills for all employees
  const employeeIds = (data ?? []).map((e) => e.id);
  const skillsMap: Record<string, EmployeeSkill[]> = {};

  if (employeeIds.length > 0) {
    const { data: allSkills } = await supabase
      .from("employee_skills")
      .select("*")
      .in("employee_id", employeeIds)
      .eq("is_active", true);

    if (allSkills) {
      for (const skill of allSkills) {
        if (!skillsMap[skill.employee_id]) skillsMap[skill.employee_id] = [];
        skillsMap[skill.employee_id].push(skill);
      }
    }
  }

  const enriched = (data ?? []).map((e) => ({
    employee: e,
    skills: skillsMap[e.id] ?? [],
  }));

  return {
    data: enriched,
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Get workspace employee dashboard stats.
 */
export async function getEmployeeDashboard(
  workspaceId: string
): Promise<{ stats?: EmployeeDashboardStats; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { error: "Access denied." };
  }

  const { data: allEmployees, error } = await supabase
    .from("ai_employees")
    .select("status, total_tasks_completed, performance_rating, total_ai_credits_used, department")
    .eq("workspace_id", workspaceId);

  if (error) {
    return { error: "Failed to fetch dashboard stats." };
  }

  const employees = allEmployees ?? [];
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e) => e.status === "active").length;
  const totalTasksCompleted = employees.reduce((sum, e) => sum + (e.total_tasks_completed ?? 0), 0);
  const totalCreditsUsed = employees.reduce((sum, e) => sum + (e.total_ai_credits_used ?? 0), 0);

  const rated = employees.filter((e) => e.performance_rating != null && e.performance_rating > 0);
  const avgRating = rated.length > 0
    ? rated.reduce((sum, e) => sum + (e.performance_rating ?? 0), 0) / rated.length
    : 0;

  // Find top department
  const deptCounts: Record<string, number> = {};
  for (const e of employees) {
    const dept = e.department || "Unassigned";
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  }
  const topDepartment = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";

  return {
    stats: {
      totalEmployees,
      activeEmployees,
      totalTasksCompleted,
      avgRating: Math.round(avgRating * 100) / 100,
      topDepartment,
      totalCreditsUsed,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// SKILLS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all skills for an employee.
 */
export async function getEmployeeSkills(
  employeeId: string
): Promise<{ skills?: EmployeeSkill[]; error?: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("employee_skills")
    .select("*")
    .eq("employee_id", employeeId)
    .order("proficiency_level", { ascending: false });

  if (error) {
    return { error: "Failed to fetch skills." };
  }
  return { skills: data ?? [] };
}

/**
 * Add a skill to an employee.
 */
export async function addEmployeeSkill(
  employeeId: string,
  skill: AddSkillRequest
): Promise<{ success: boolean; message: string; error?: string; skill?: EmployeeSkill }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: employee } = await supabase
    .from("ai_employees")
    .select("workspace_id, created_by")
    .eq("id", employeeId)
    .single();

  if (!employee) {
    return { success: false, message: "Employee not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(employee.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data, error } = await supabase
    .from("employee_skills")
    .insert({
      employee_id: employeeId,
      skill_name: skill.skill_name.trim(),
      skill_category: skill.skill_category ?? "general",
      proficiency_level: skill.proficiency_level ?? 50,
      is_active: true,
    })
    .select()
    .single();

  if (error || !data) {
    logger.error("Failed to add employee skill", { reason: error?.message });
    return { success: false, message: "Failed to add skill.", error: "INSERT_FAILED" };
  }

  revalidatePath("/employees");
  return { success: true, message: "Skill added.", skill: data };
}

/**
 * Remove a skill.
 */
export async function removeEmployeeSkill(
  skillId: string
): Promise<EmployeeActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: skill } = await supabase
    .from("employee_skills")
    .select("employee_id, employee:ai_employees(workspace_id)")
    .eq("id", skillId)
    .single();

  if (!skill) {
    return { success: false, message: "Skill not found.", error: "NOT_FOUND" };
  }

  const wsId = (skill as Record<string, unknown>)?.workspace_id as string | undefined;
  if (wsId) {
    const membership = await verifyWorkspaceMembership(wsId, profile.id);
    if (!membership || !hasMinimumRole(membership.role as Role, "member")) {
      return { success: false, message: "Access denied.", error: "FORBIDDEN" };
    }
  }

  const { error } = await supabase
    .from("employee_skills")
    .delete()
    .eq("id", skillId);

  if (error) {
    return { success: false, message: "Failed to remove skill.", error: "DELETE_FAILED" };
  }

  revalidatePath("/employees");
  return { success: true, message: "Skill removed." };
}

// ═══════════════════════════════════════════════════════════════
// MEMORY
// ═══════════════════════════════════════════════════════════════

/**
 * Get employee memory entries.
 */
export async function getEmployeeMemory(
  employeeId: string,
  scope?: EmployeeMemoryScope
): Promise<{ memory?: EmployeeMemory[]; error?: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("employee_memory")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (scope) {
    query = query.eq("scope", scope);
  }

  const { data, error } = await query;
  if (error) {
    return { error: "Failed to fetch memory." };
  }
  return { memory: data ?? [] };
}

/**
 * Add a memory entry.
 */
export async function addEmployeeMemory(
  employeeId: string,
  memory: AddMemoryRequest
): Promise<{ success: boolean; message: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: employee } = await supabase
    .from("ai_employees")
    .select("workspace_id")
    .eq("id", employeeId)
    .single();

  if (!employee) {
    return { success: false, message: "Employee not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(employee.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error } = await supabase.from("employee_memory").insert({
    employee_id: employeeId,
    scope: memory.scope,
    category: memory.category ?? "general",
    content: memory.content,
    metadata: memory.metadata ?? {},
    workspace_id: memory.workspace_id ?? employee.workspace_id,
  });

  if (error) {
    logger.error("Failed to add employee memory", { reason: error?.message });
    return { success: false, message: "Failed to add memory.", error: "INSERT_FAILED" };
  }

  revalidatePath("/employees");
  return { success: true, message: "Memory added." };
}

/**
 * Clear employee memory by scope.
 */
export async function clearEmployeeMemory(
  employeeId: string,
  scope?: EmployeeMemoryScope
): Promise<EmployeeActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("employee_memory")
    .delete()
    .eq("employee_id", employeeId);

  if (scope) {
    query = query.eq("scope", scope);
  }

  const { error } = await query;
  if (error) {
    return { success: false, message: "Failed to clear memory.", error: "DELETE_FAILED" };
  }

  return { success: true, message: "Memory cleared." };
}

// ═══════════════════════════════════════════════════════════════
// TRAINING
// ═══════════════════════════════════════════════════════════════

/**
 * Start training an employee.
 */
export async function trainEmployee(
  employeeId: string,
  trainingType: EmployeeTrainingType,
  source: AddTrainingRequest,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error } = await supabase.from("employee_training").insert({
    employee_id: employeeId,
    training_type: trainingType,
    source_name: source.source_name,
    source_url: source.source_url ?? null,
    status: "pending" as EmployeeTrainingStatus,
    created_by: profile.id,
  });

  if (error) {
    logger.error("Failed to start employee training", { reason: error?.message });
    return { success: false, message: "Failed to start training.", error: "INSERT_FAILED" };
  }

  await logActivity(
    "employee_train" as ActivityAction,
    `Started training: ${source.source_name}`,
    { employeeId },
    workspaceId
  );
  void createNotification(profile.id, "employee", "Training started", `Training: ${source.source_name}`, "/employees");
  revalidatePath("/employees");
  return { success: true, message: "Training started." };
}

/**
 * Get employee training history.
 */
export async function getEmployeeTraining(
  employeeId: string
): Promise<{ training?: EmployeeTraining[]; error?: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("employee_training")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (error) {
    return { error: "Failed to fetch training history." };
  }
  return { training: data ?? [] };
}

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE
// ═══════════════════════════════════════════════════════════════

/**
 * Get employee performance records.
 */
export async function getEmployeePerformance(
  employeeId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<{ performance?: EmployeePerformance[]; error?: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("employee_performance")
    .select("*")
    .eq("employee_id", employeeId)
    .order("period_start", { ascending: false });

  if (periodStart) {
    query = query.gte("period_start", periodStart);
  }
  if (periodEnd) {
    query = query.lte("period_end", periodEnd);
  }

  const { data, error } = await query;
  if (error) {
    return { error: "Failed to fetch performance data." };
  }
  return { performance: data ?? [] };
}

/**
 * Record employee performance metrics.
 */
export async function recordEmployeePerformance(
  employeeId: string,
  metrics: RecordPerformanceMetrics,
  workspaceId: string
): Promise<EmployeeActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error } = await supabase.from("employee_performance").insert({
    employee_id: employeeId,
    workspace_id: workspaceId,
    period_start: metrics.period_start,
    period_end: metrics.period_end,
    tasks_completed: metrics.tasks_completed ?? 0,
    tasks_failed: metrics.tasks_failed ?? 0,
    avg_response_time_ms: metrics.avg_response_time_ms ?? 0,
    ai_credits_used: metrics.ai_credits_used ?? 0,
    user_rating: metrics.user_rating ?? 0,
  });

  if (error) {
    logger.error("Failed to record performance", { reason: error?.message });
    return { success: false, message: "Failed to record performance.", error: "INSERT_FAILED" };
  }

  // Update aggregate on the employee itself
  const perf = metrics;
  if (perf.tasks_completed) {
    await Promise.resolve(); // placeholder for aggregate update
  }

  revalidatePath("/employees");
  return { success: true, message: "Performance recorded." };
}

// ═══════════════════════════════════════════════════════════════
// MARKETPLACE
// ═══════════════════════════════════════════════════════════════

/**
 * Browse marketplace employees.
 */
export async function getMarketplaceEmployees(
  options?: MarketplaceListOptions
): Promise<PaginatedEmployeeResponse<EmployeeMarketplace & { employee?: AiEmployee }> | { error: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 12;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("employee_marketplace")
    .select("*, employee:ai_employees(*)", { count: "exact" })
    .not("published_at", "is", null);

  if (options?.category && options.category !== "all") {
    query = query.eq("category", options.category);
  }
  if (options?.featured) {
    query = query.eq("is_featured", true);
  }
  if (options?.search) {
    query = query.ilike("description", `%${options.search}%`);
  }

  query = query.order("rating", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch marketplace", { reason: error.message });
    return { error: "Failed to fetch marketplace." };
  }

  return {
    data: (data ?? []) as (EmployeeMarketplace & { employee?: AiEmployee })[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Install a marketplace employee into workspace.
 */
export async function installMarketplaceEmployee(
  employeeId: string,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Increment install count
  const { data: currentMarketplace } = await supabase
    .from("employee_marketplace")
    .select("install_count")
    .eq("employee_id", employeeId)
    .single();

  await supabase
    .from("employee_marketplace")
    .update({ install_count: (currentMarketplace?.install_count ?? 0) + 1 })
    .eq("employee_id", employeeId);

  // Create assignment
  const { error } = await supabase.from("employee_assignments").insert({
    employee_id: employeeId,
    workspace_id: workspaceId,
    assignment_type: "conversation",
    status: "active",
  });

  if (error) {
    return { success: false, message: "Failed to install employee.", error: "INSTALL_FAILED" };
  }

  await logActivity(
    "employee_install" as ActivityAction,
    `Installed marketplace AI employee`,
    { employeeId },
    workspaceId
  );
  revalidatePath("/employees");
  return { success: true, message: "Employee installed successfully." };
}

/**
 * Rate a marketplace employee.
 */
export async function rateMarketplaceEmployee(
  employeeId: string,
  rating: number,
  workspaceId: string
): Promise<EmployeeActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (rating < 0 || rating > 5) {
    return { success: false, message: "Rating must be between 0 and 5.", error: "INVALID_RATING" };
  }

  // Get current data
  const { data: current } = await supabase
    .from("employee_marketplace")
    .select("rating, review_count")
    .eq("employee_id", employeeId)
    .single();

  if (!current) {
    return { success: false, message: "Employee not in marketplace.", error: "NOT_FOUND" };
  }

  const newCount = (current.review_count ?? 0) + 1;
  const newRating = ((current.rating ?? 0) * (current.review_count ?? 0) + rating) / newCount;

  const { error } = await supabase
    .from("employee_marketplace")
    .update({
      rating: Math.round(newRating * 100) / 100,
      review_count: newCount,
    })
    .eq("employee_id", employeeId);

  if (error) {
    return { success: false, message: "Failed to rate employee.", error: "UPDATE_FAILED" };
  }

  return { success: true, message: "Rating submitted." };
}

// ═══════════════════════════════════════════════════════════════
// MESSAGING
// ═══════════════════════════════════════════════════════════════

/**
 * Get messages for a conversation.
 */
export async function getEmployeeMessages(
  conversationId: string
): Promise<{ messages?: EmployeeMessage[]; error?: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("employee_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: "Failed to fetch messages." };
  }
  return { messages: data ?? [] };
}

/**
 * Send a message to/from an employee.
 */
export async function sendEmployeeMessage(
  senderId: string,
  recipientId: string,
  content: string,
  workspaceId: string
): Promise<{ success: boolean; message: string; error?: string; msg?: EmployeeMessage }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const conversationId = [senderId, recipientId].sort().join("-");

  const { data, error } = await supabase
    .from("employee_messages")
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      workspace_id: workspaceId,
      conversation_id: conversationId,
      content: content.trim(),
    })
    .select()
    .single();

  if (error || !data) {
    logger.error("Failed to send employee message", { reason: error?.message });
    return { success: false, message: "Failed to send message.", error: "INSERT_FAILED" };
  }

  return { success: true, message: "Message sent.", msg: data };
}
