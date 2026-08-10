"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";
import { PAGINATION } from "@/config/constants";
import type {
  Workflow,
  WorkflowLog,
  WorkflowTrigger,
  WorkflowAction,
  ScheduledJob,
  AutomationTemplate,
  WorkflowStatus,
  WorkflowRunStatus,
  TriggerType,
  ActionType,
  ExecutionMode,
  ScheduleType,
  ScheduledJobStatus,
  VariableScope,
  AutomationActionResponse,
  PaginatedAutomationResponse,
  WorkflowListOptions,
  WorkflowRunListOptions,
  WorkflowLogListOptions,
  ScheduledJobListOptions,
  TemplateListOptions,
  WorkflowWithRelations,
  WorkflowRunWithRelations,
  WorkflowDetail,
  AutomationMetrics,
} from "./types";
import type { Json } from "@/types/generated/database";
import { executeWorkflowManually, stopWorkflowRun as engineStopRun, retryWorkflowRun as engineRetryRun } from "./engine";
import { calculateNextRunTime } from "./scheduler";

// ── Helpers ──────────────────────────────────────────────────────
async function requireAdminOrOwner(
  _supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  let membership;
  try { membership = await verifyWorkspaceMembership(workspaceId, userId); } catch { return false; }
  return membership.role === "owner" || membership.role === "admin";
}

// ── Workflow CRUD ────────────────────────────────────────────────

export async function createWorkflow(
  workspaceId: string,
  data: {
    name: string;
    description?: string;
    executionMode?: ExecutionMode;
    tags?: string[];
  },
): Promise<AutomationActionResponse & { data?: Workflow }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions." };

    const { data: workflow, error } = await supabase
      .from("workflows")
      .insert({
        workspace_id: workspaceId,
        name: data.name,
        description: data.description ?? "",
        execution_mode: data.executionMode ?? "sequential",
        tags: data.tags ?? [],
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      logger.error("Failed to create workflow", { error: error.message });
      return { success: false, message: "Failed to create workflow", error: error.message };
    }

    // Create initial version
    await supabase.from("workflow_versions").insert({
      workflow_id: workflow.id,
      version_number: 1,
      definition: { actions: [], triggers: [] },
      change_summary: "Initial version",
      created_by: profile.id,
    });

    await logActivity("workspace_update", `Workflow created: ${data.name}`, { workflowId: workflow.id }, workspaceId);

    revalidatePath(`/automation`);
    return { success: true, message: "Workflow created", data: workflow as unknown as Workflow };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("createWorkflow error", { error: message });
    return { success: false, message: "Failed to create workflow", error: message };
  }
}

export async function updateWorkflow(
  workflowId: string,
  workspaceId: string,
  data: {
    name?: string;
    description?: string;
    status?: WorkflowStatus;
    executionMode?: ExecutionMode;
    tags?: string[];
    metadata?: Json;
  },
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions." };

    const { error } = await supabase
      .from("workflows")
      .update(data)
      .eq("id", workflowId)
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to update workflow", { error: error.message });
      return { success: false, message: "Failed to update workflow", error: error.message };
    }

    await logActivity("workspace_update", `Workflow updated: ${Object.keys(data).join(", ")}`, { workflowId }, workspaceId);

    revalidatePath(`/automation/workflows/${workflowId}`);
    return { success: true, message: "Workflow updated" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("updateWorkflow error", { error: message });
    return { success: false, message: "Failed to update workflow", error: message };
  }
}

export async function deleteWorkflow(
  workflowId: string,
  workspaceId: string,
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions." };

    const { error } = await supabase
      .from("workflows")
      .delete()
      .eq("id", workflowId)
      .eq("workspace_id", workspaceId);

    if (error) {
      return { success: false, message: "Failed to delete workflow", error: error.message };
    }

    await logActivity("workspace_update", "Workflow deleted", { workflowId }, workspaceId);

    revalidatePath("/automation");
    return { success: true, message: "Workflow deleted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to delete workflow", error: message };
  }
}

export async function getWorkflows(
  options: WorkflowListOptions,
): Promise<PaginatedAutomationResponse<WorkflowWithRelations>> {
  try {
    await  requireAuth();
    const supabase = await createServerSupabaseClient();

    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("workflows")
      .select("*", { count: "exact" })
      .eq("workspace_id", options.workspaceId);

    if (options.status) {
      query = query.eq("status", options.status);
    }

    if (options.search) {
      query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`);
    }

    query = query.order("updated_at", { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      return { data: [], total: 0, page, pageSize };
    }

    // Enrich with counts
    const workflowIds = (data ?? []).map((w) => w.id);
    const [triggerCounts, actionCounts, runStats] = await Promise.all([
      workflowIds.length > 0
        ? supabase.from("workflow_triggers").select("workflow_id").in("workflow_id", workflowIds)
        : Promise.resolve({ data: [] }),
      workflowIds.length > 0
        ? supabase.from("workflow_actions").select("workflow_id").in("workflow_id", workflowIds)
        : Promise.resolve({ data: [] }),
      workflowIds.length > 0
        ? supabase
            .from("workflow_runs")
            .select("workflow_id, status, created_at")
            .in("workflow_id", workflowIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const triggerMap: Record<string, number> = {};
    for (const t of triggerCounts.data ?? []) {
      triggerMap[t.workflow_id] = (triggerMap[t.workflow_id] ?? 0) + 1;
    }

    const actionMap: Record<string, number> = {};
    for (const a of actionCounts.data ?? []) {
      actionMap[a.workflow_id] = (actionMap[a.workflow_id] ?? 0) + 1;
    }

    const runMap: Record<string, { count: number; lastAt: string | null; lastStatus: WorkflowRunStatus | null }> = {};
    for (const r of runStats.data ?? []) {
      if (!runMap[r.workflow_id]) {
        runMap[r.workflow_id] = { count: 0, lastAt: null, lastStatus: null };
      }
      runMap[r.workflow_id].count++;
      if (!runMap[r.workflow_id].lastAt) {
        runMap[r.workflow_id].lastAt = r.created_at;
        runMap[r.workflow_id].lastStatus = r.status;
      }
    }

    const enriched = (data ?? []).map((w) => ({
      ...w,
      triggerCount: triggerMap[w.id] ?? 0,
      actionCount: actionMap[w.id] ?? 0,
      runCount: runMap[w.id]?.count ?? 0,
      lastRunAt: runMap[w.id]?.lastAt ?? null,
      lastRunStatus: runMap[w.id]?.lastStatus ?? null,
    })) as WorkflowWithRelations[];

    return { data: enriched, total: count ?? 0, page, pageSize };
  } catch (error) {
    logger.error("getWorkflows error", { error: error instanceof Error ? error.message : String(error) });
    return { data: [], total: 0, page: options.page ?? 1, pageSize: options.pageSize ?? 20 };
  }
}

export async function getWorkflow(
  workflowId: string,
  workspaceId: string,
): Promise<AutomationActionResponse & { data?: WorkflowDetail }> {
  try {
    await  requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: workflow, error } = await supabase
      .from("workflows")
      .select()
      .eq("id", workflowId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !workflow) {
      return { success: false, message: "Workflow not found", error: "Workflow not found" };
    }

    const [triggers, actions, variables, versions] = await Promise.all([
      supabase.from("workflow_triggers").select().eq("workflow_id", workflowId).order("sort_order"),
      supabase.from("workflow_actions").select().eq("workflow_id", workflowId).order("step_position"),
      supabase.from("workflow_variables").select().eq("workflow_id", workflowId).is("run_id", null),
      supabase.from("workflow_versions").select().eq("workflow_id", workflowId).order("version_number", { ascending: false }),
    ]);

    return {
      success: true,
      message: "Workflow retrieved",
      data: {
        ...workflow,
        triggers: triggers.data ?? [],
        actions: actions.data ?? [],
        variables: variables.data ?? [],
        versions: versions.data ?? [],
      } as unknown as WorkflowDetail,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to get workflow", error: message };
  }
}

// ── Trigger CRUD ────────────────────────────────────────────────

export async function createTrigger(
  workflowId: string,
  workspaceId: string,
  data: {
    name: string;
    triggerType: TriggerType;
    eventName?: string;
    config?: Json;
  },
): Promise<AutomationActionResponse & { data?: WorkflowTrigger }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions." };

    const { data: triggers } = await supabase
      .from("workflow_triggers")
      .select("sort_order")
      .eq("workflow_id", workflowId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSort = ((triggers?.[0]?.sort_order ?? -1) as number) + 1;

    const { data: trigger, error } = await supabase
      .from("workflow_triggers")
      .insert({
        workflow_id: workflowId,
        name: data.name,
        trigger_type: data.triggerType,
        event_name: data.eventName ?? "",
        config: data.config ?? {},
        sort_order: nextSort,
      })
      .select()
      .single();

    if (error) {
      return { success: false, message: "Failed to create trigger", error: error.message };
    }

    revalidatePath(`/automation/workflows/${workflowId}`);
    return { success: true, message: "Trigger created", data: trigger as unknown as WorkflowTrigger };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to create trigger", error: message };
  }
}

export async function updateTrigger(
  triggerId: string,
  workspaceId: string,
  data: {
    name?: string;
    triggerType?: TriggerType;
    eventName?: string;
    config?: Json;
    isEnabled?: boolean;
  },
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions." };

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.triggerType !== undefined) updateData.trigger_type = data.triggerType;
    if (data.eventName !== undefined) updateData.event_name = data.eventName;
    if (data.config !== undefined) updateData.config = data.config;
    if (data.isEnabled !== undefined) updateData.is_enabled = data.isEnabled;

    const { error } = await supabase
      .from("workflow_triggers")
      .update(updateData)
      .eq("id", triggerId);

    if (error) {
      return { success: false, message: "Failed to update trigger", error: error.message };
    }

    revalidatePath("/automation");
    return { success: true, message: "Trigger updated" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to update trigger", error: message };
  }
}

export async function deleteTrigger(
  triggerId: string,
  workspaceId: string,
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions." };

    const { error } = await supabase
      .from("workflow_triggers")
      .delete()
      .eq("id", triggerId);

    if (error) {
      return { success: false, message: "Failed to delete trigger", error: error.message };
    }

    revalidatePath("/automation");
    return { success: true, message: "Trigger deleted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to delete trigger", error: message };
  }
}

// ── Action CRUD ─────────────────────────────────────────────────

export async function createAction(
  workflowId: string,
  workspaceId: string,
  data: {
    name: string;
    actionType: ActionType;
    config?: Json;
    stepPosition?: number;
    retryLimit?: number;
    timeoutMs?: number;
    onFailure?: string;
  },
): Promise<AutomationActionResponse & { data?: WorkflowAction }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions." };

    // Auto-assign step position if not provided
    let stepPosition = data.stepPosition ?? 0;
    if (data.stepPosition === undefined) {
      const { data: existing } = await supabase
        .from("workflow_actions")
        .select("step_position")
        .eq("workflow_id", workflowId)
        .order("step_position", { ascending: false })
        .limit(1);
      stepPosition = ((existing?.[0]?.step_position ?? -1) as number) + 1;
    }

    const { data: action, error } = await supabase
      .from("workflow_actions")
      .insert({
        workflow_id: workflowId,
        name: data.name,
        action_type: data.actionType,
        config: data.config ?? {},
        step_position: stepPosition,
        retry_limit: data.retryLimit ?? 0,
        timeout_ms: data.timeoutMs ?? 30000,
        on_failure: data.onFailure ?? "stop",
      })
      .select()
      .single();

    if (error) {
      return { success: false, message: "Failed to create action", error: error.message };
    }

    revalidatePath(`/automation/workflows/${workflowId}`);
    return { success: true, message: "Action created", data: action as unknown as WorkflowAction };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to create action", error: message };
  }
}

export async function updateAction(
  actionId: string,
  workspaceId: string,
  data: {
    name?: string;
    actionType?: ActionType;
    config?: Json;
    stepPosition?: number;
    retryLimit?: number;
    timeoutMs?: number;
    onFailure?: string;
    isEnabled?: boolean;
  },
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions." };

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.actionType !== undefined) updateData.action_type = data.actionType;
    if (data.config !== undefined) updateData.config = data.config;
    if (data.stepPosition !== undefined) updateData.step_position = data.stepPosition;
    if (data.retryLimit !== undefined) updateData.retry_limit = data.retryLimit;
    if (data.timeoutMs !== undefined) updateData.timeout_ms = data.timeoutMs;
    if (data.onFailure !== undefined) updateData.on_failure = data.onFailure;
    if (data.isEnabled !== undefined) updateData.is_enabled = data.isEnabled;

    const { error } = await supabase
      .from("workflow_actions")
      .update(updateData)
      .eq("id", actionId);

    if (error) {
      return { success: false, message: "Failed to update action", error: error.message };
    }

    revalidatePath("/automation");
    return { success: true, message: "Action updated" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to update action", error: message };
  }
}

export async function deleteAction(
  actionId: string,
  workspaceId: string,
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Access denied." };
    }
    if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions." };

    const { error } = await supabase
      .from("workflow_actions")
      .delete()
      .eq("id", actionId);

    if (error) {
      return { success: false, message: "Failed to delete action", error: error.message };
    }

    revalidatePath("/automation");
    return { success: true, message: "Action deleted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to delete action", error: message };
  }
}

// ── Variable CRUD ───────────────────────────────────────────────

export async function upsertVariable(
  workflowId: string,
  workspaceId: string,
  data: {
    name: string;
    value: Json;
    scope?: VariableScope;
    isEncrypted?: boolean;
  },
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const isAdmin = await requireAdminOrOwner(supabase, profile.id, workspaceId);
    if (!isAdmin) return { success: false, message: "Insufficient permissions" };

    // Upsert: update if exists, insert if not
    const { data: existing } = await supabase
      .from("workflow_variables")
      .select("id")
      .eq("workflow_id", workflowId)
      .eq("name", data.name)
      .is("run_id", null)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("workflow_variables")
        .update({ value: data.value, scope: data.scope ?? "local", is_encrypted: data.isEncrypted ?? false })
        .eq("id", existing.id);
      if (error) return { success: false, message: "Failed to update variable", error: error.message };
    } else {
      const { error } = await supabase
        .from("workflow_variables")
        .insert({
          workflow_id: workflowId,
          name: data.name,
          value: data.value,
          scope: data.scope ?? "local",
          is_encrypted: data.isEncrypted ?? false,
        });
      if (error) return { success: false, message: "Failed to create variable", error: error.message };
    }

    revalidatePath(`/automation/workflows/${workflowId}`);
    return { success: true, message: "Variable saved" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to save variable", error: message };
  }
}

export async function deleteVariable(
  variableId: string,
  workspaceId: string,
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const isAdmin = await requireAdminOrOwner(supabase, profile.id, workspaceId);
    if (!isAdmin) return { success: false, message: "Insufficient permissions" };

    const { error } = await supabase
      .from("workflow_variables")
      .delete()
      .eq("id", variableId);

    if (error) {
      return { success: false, message: "Failed to delete variable", error: error.message };
    }

    return { success: true, message: "Variable deleted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to delete variable", error: message };
  }
}

// ── Workflow Execution ───────────────────────────────────────────

export async function runWorkflow(
  workflowId: string,
  workspaceId: string,
  inputData?: Json,
): Promise<AutomationActionResponse & { runId?: string }> {
  try {
    const profile = await requireAuth();

    const result = await executeWorkflowManually({
      workflowId,
      workspaceId,
      userId: profile.id,
      inputData: inputData ?? {},
    });

    if (result.success) {
      await logActivity("workspace_update", "Workflow executed", { workflowId, runId: result.runId }, workspaceId);
    }

    revalidatePath(`/automation/workflows/${workflowId}`);
    return {
      success: result.success,
      message: result.success ? "Workflow executed" : "Workflow execution failed",
      runId: result.runId,
      error: result.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to run workflow", error: message };
  }
}

export async function stopRun(
  runId: string,
  workspaceId: string,
): Promise<AutomationActionResponse> {
  try {
    await  requireAuth();

    const result = await engineStopRun(runId, workspaceId);
    revalidatePath("/automation");
    return {
      success: result.success,
      message: result.success ? "Run stopped" : "Failed to stop run",
      error: result.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to stop run", error: message };
  }
}

export async function retryRun(
  runId: string,
  workspaceId: string,
): Promise<AutomationActionResponse & { newRunId?: string }> {
  try {
    await  requireAuth();

    const result = await engineRetryRun(runId, workspaceId);
    revalidatePath("/automation");
    return {
      success: result.success,
      message: result.success ? "Run retried" : "Failed to retry run",
      newRunId: result.newRunId,
      error: result.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to retry run", error: message };
  }
}

// ── Execution History ────────────────────────────────────────────

export async function getWorkflowRuns(
  options: WorkflowRunListOptions,
): Promise<PaginatedAutomationResponse<WorkflowRunWithRelations>> {
  try {
    await  requireAuth();
    const supabase = await createServerSupabaseClient();

    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("workflow_runs")
      .select(`
        *,
        workflows!inner(id, name)
      `, { count: "exact" })
      .eq("workspace_id", options.workspaceId);

    if (options.workflowId) {
      query = query.eq("workflow_id", options.workflowId);
    }
    if (options.status) {
      query = query.eq("status", options.status);
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      return { data: [], total: 0, page, pageSize };
    }

    const enriched = (data ?? []).map((r) => ({
      ...r,
      workflow: r.workflows,
    })) as WorkflowRunWithRelations[];

    return { data: enriched, total: count ?? 0, page, pageSize };
  } catch {
    return { data: [], total: 0, page: options.page ?? 1, pageSize: options.pageSize ?? 20 };
  }
}

// ── Logs ────────────────────────────────────────────────────────

export async function getWorkflowLogs(
  options: WorkflowLogListOptions,
): Promise<PaginatedAutomationResponse<WorkflowLog>> {
  try {
    await  requireAuth();
    const supabase = await createServerSupabaseClient();

    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("workflow_logs")
      .select("*", { count: "exact" })
      .eq("workspace_id", options.workspaceId);

    if (options.runId) {
      query = query.eq("run_id", options.runId);
    }
    if (options.workflowId) {
      query = query.eq("workflow_id", options.workflowId);
    }
    if (options.level) {
      query = query.eq("level", options.level);
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      return { data: [], total: 0, page, pageSize };
    }

    return { data: (data ?? []) as WorkflowLog[], total: count ?? 0, page, pageSize };
  } catch {
    return { data: [], total: 0, page: options.page ?? 1, pageSize: options.pageSize ?? 20 };
  }
}

// ── Scheduled Jobs ──────────────────────────────────────────────

export async function createScheduledJob(
  workflowId: string,
  workspaceId: string,
  data: {
    name: string;
    scheduleType: ScheduleType;
    cronExpression?: string;
    timezone?: string;
    maxRuns?: number;
    config?: Json;
  },
): Promise<AutomationActionResponse & { data?: ScheduledJob }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const isAdmin = await requireAdminOrOwner(supabase, profile.id, workspaceId);
    if (!isAdmin) return { success: false, message: "Insufficient permissions" };

    const tz = data.timezone ?? "UTC";
    const nextRun = calculateNextRunTime(
      data.scheduleType,
      data.cronExpression ?? "",
      tz,
    );

    const { data: job, error } = await supabase
      .from("scheduled_jobs")
      .insert({
        workflow_id: workflowId,
        workspace_id: workspaceId,
        name: data.name,
        schedule_type: data.scheduleType,
        cron_expression: data.cronExpression ?? "",
        timezone: tz,
        next_run_at: nextRun ? nextRun.toISOString() : null,
        max_runs: data.maxRuns ?? null,
        config: data.config ?? {},
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      return { success: false, message: "Failed to create scheduled job", error: error.message };
    }

    revalidatePath("/automation/scheduled");
    return { success: true, message: "Scheduled job created", data: job as unknown as ScheduledJob };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to create scheduled job", error: message };
  }
}

export async function updateScheduledJob(
  jobId: string,
  workspaceId: string,
  data: {
    name?: string;
    scheduleType?: ScheduleType;
    cronExpression?: string;
    timezone?: string;
    status?: ScheduledJobStatus;
    maxRuns?: number;
    config?: Json;
  },
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const isAdmin = await requireAdminOrOwner(supabase, profile.id, workspaceId);
    if (!isAdmin) return { success: false, message: "Insufficient permissions" };

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.scheduleType !== undefined) updateData.schedule_type = data.scheduleType;
    if (data.cronExpression !== undefined) updateData.cron_expression = data.cronExpression;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.maxRuns !== undefined) updateData.max_runs = data.maxRuns;
    if (data.config !== undefined) updateData.config = data.config;

    // Recalculate next run if schedule changed
    if (data.scheduleType || data.cronExpression || data.timezone) {
      const { data: job } = await supabase
        .from("scheduled_jobs")
        .select("schedule_type, cron_expression, timezone")
        .eq("id", jobId)
        .single();

      if (job) {
        const nextRun = calculateNextRunTime(
          data.scheduleType ?? job.schedule_type,
          data.cronExpression ?? job.cron_expression,
          data.timezone ?? job.timezone,
        );
        updateData.next_run_at = nextRun ? nextRun.toISOString() : null;
      }
    }

    const { error } = await supabase
      .from("scheduled_jobs")
      .update(updateData)
      .eq("id", jobId);

    if (error) {
      return { success: false, message: "Failed to update scheduled job", error: error.message };
    }

    revalidatePath("/automation/scheduled");
    return { success: true, message: "Scheduled job updated" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to update scheduled job", error: message };
  }
}

export async function deleteScheduledJob(
  jobId: string,
  workspaceId: string,
): Promise<AutomationActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let membership;
    try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Only workspace owners can delete scheduled jobs" };
    }
    if (membership.role !== "owner") {
      return { success: false, message: "Only workspace owners can delete scheduled jobs" };
    }

    const { error } = await supabase
      .from("scheduled_jobs")
      .delete()
      .eq("id", jobId);

    if (error) {
      return { success: false, message: "Failed to delete scheduled job", error: error.message };
    }

    revalidatePath("/automation/scheduled");
    return { success: true, message: "Scheduled job deleted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to delete scheduled job", error: message };
  }
}

export async function getScheduledJobs(
  options: ScheduledJobListOptions,
): Promise<PaginatedAutomationResponse<ScheduledJob>> {
  try {
    await  requireAuth();
    const supabase = await createServerSupabaseClient();

    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("scheduled_jobs")
      .select("*, workflows!inner(id, name, status)", { count: "exact" })
      .eq("workspace_id", options.workspaceId);

    if (options.status) {
      query = query.eq("status", options.status);
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      return { data: [], total: 0, page, pageSize };
    }

    return { data: (data ?? []) as unknown as ScheduledJob[], total: count ?? 0, page, pageSize };
  } catch {
    return { data: [], total: 0, page: options.page ?? 1, pageSize: options.pageSize ?? 20 };
  }
}

// ── Templates ───────────────────────────────────────────────────

export async function getTemplates(
  options?: TemplateListOptions,
): Promise<PaginatedAutomationResponse<AutomationTemplate>> {
  try {
    await  requireAuth();
    const supabase = await createServerSupabaseClient();

    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("automation_templates")
      .select("*", { count: "exact" });

    if (options?.category) {
      query = query.eq("category", options.category);
    }
    if (options?.search) {
      query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`);
    }

    query = query.order("usage_count", { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      return { data: [], total: 0, page, pageSize };
    }

    return { data: (data ?? []) as unknown as AutomationTemplate[], total: count ?? 0, page, pageSize };
  } catch {
    return { data: [], total: 0, page: options?.page ?? 1, pageSize: options?.pageSize ?? 20 };
  }
}

export async function createWorkflowFromTemplate(
  workspaceId: string,
  templateId: string,
  name: string,
): Promise<AutomationActionResponse & { data?: Workflow }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const isAdmin = await requireAdminOrOwner(supabase, profile.id, workspaceId);
    if (!isAdmin) return { success: false, message: "Insufficient permissions" };

    const { data: template } = await supabase
      .from("automation_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (!template) {
      return { success: false, message: "Template not found" };
    }

    // Create workflow from template definition
    const { data: workflow, error: wfError } = await supabase
      .from("workflows")
      .insert({
        workspace_id: workspaceId,
        name: name || template.name,
        description: template.description,
        status: "draft",
        tags: template.tags,
        created_by: profile.id,
      })
      .select()
      .single();

    if (wfError || !workflow) {
      return { success: false, message: "Failed to create workflow from template" };
    }

    // Create version with template definition
    await supabase.from("workflow_versions").insert({
      workflow_id: workflow.id,
      version_number: 1,
      definition: template.definition,
      change_summary: `Created from template: ${template.name}`,
      created_by: profile.id,
    });

    // Create triggers from template
    const triggers = (template.triggers ?? []) as Array<Record<string, unknown>>;
    if (triggers.length > 0) {
      const triggerInserts = triggers.map((t, i) => ({
        workflow_id: workflow.id,
        name: (t.name as string) || `Trigger ${i + 1}`,
        trigger_type: (t.trigger_type as string) || "event",
        event_name: (t.event_name as string) || "",
        config: (t.config as Record<string, unknown>) || {},
        sort_order: i,
      }));
      await supabase.from("workflow_triggers").insert(triggerInserts);
    }

    // Create actions from template
    const actions = (template.actions ?? []) as Array<Record<string, unknown>>;
    if (actions.length > 0) {
      const actionInserts = actions.map((a, i) => ({
        workflow_id: workflow.id,
        name: (a.name as string) || `Action ${i + 1}`,
        action_type: (a.action_type as string) || "custom",
        config: (a.config as Record<string, unknown>) || {},
        step_position: i,
      }));
      await supabase.from("workflow_actions").insert(actionInserts);
    }

    // Increment template usage count
    await supabase
      .from("automation_templates")
      .update({ usage_count: template.usage_count + 1 })
      .eq("id", templateId);

    revalidatePath("/automation");
    return { success: true, message: "Workflow created from template", data: workflow as unknown as Workflow };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to create workflow from template", error: message };
  }
}

// ── Metrics ─────────────────────────────────────────────────────

export async function getAutomationMetrics(
  workspaceId: string,
): Promise<AutomationActionResponse & { data?: AutomationMetrics }> {
  try {
    await  requireAuth();
    const supabase = await createServerSupabaseClient();

    const [workflows, runs, scheduled] = await Promise.all([
      supabase.from("workflows").select("id, status").eq("workspace_id", workspaceId),
      supabase.from("workflow_runs").select("id, status, duration_ms").eq("workspace_id", workspaceId),
      supabase.from("scheduled_jobs").select("id, status").eq("workspace_id", workspaceId),
    ]);

    const wfList = workflows.data ?? [];
    const runList = runs.data ?? [];
    const sjList = scheduled.data ?? [];

    const totalWorkflows = wfList.length;
    const activeWorkflows = wfList.filter((w) => w.status === "active").length;
    const totalRuns = runList.length;
    const runningRuns = runList.filter((r) => r.status === "running" || r.status === "retrying").length;
    const failedRuns = runList.filter((r) => r.status === "failed").length;
    const retryRuns = runList.filter((r) => r.status === "retrying").length;
    const completedWithDuration = runList.filter((r) => r.status === "completed" && r.duration_ms !== null);
    const avgExecutionMs = completedWithDuration.length > 0
      ? Math.round(completedWithDuration.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0) / completedWithDuration.length)
      : 0;
    const scheduledJobs = sjList.length;
    const activeScheduledJobs = sjList.filter((s) => s.status === "active").length;

    return {
      success: true,
      message: "Metrics retrieved",
      data: {
        totalWorkflows,
        activeWorkflows,
        totalRuns,
        runningRuns,
        failedRuns,
        avgExecutionMs,
        retryCount: retryRuns,
        scheduledJobs,
        activeScheduledJobs,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: "Failed to get metrics", error: message };
  }
}

// ── Debug Execute Step ──────────────────────────────────────────

export async function debugExecuteStep(workflowId: string, stepPosition: number, _inputData: Record<string, unknown>): Promise<{ output?: Record<string, unknown>; error?: string; duration_ms?: number }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify workflow exists and get workspace
  const { data: workflow } = await supabase.from('workflows').select('workspace_id').eq('id', workflowId).single();
  if (!workflow) return { error: 'Workflow not found' };

  // Verify workspace membership
  const { data: membership } = await supabase.from('workspace_members').select('id').eq('workspace_id', workflow.workspace_id).eq('user_id', profile.id).single();
  if (!membership) return { error: 'Access denied' };

  // Get the action at this step
  const { data: action } = await supabase.from('workflow_actions').select('*').eq('workflow_id', workflowId).eq('step_position', stepPosition).single();
  if (!action) return { error: 'Action not found' };

  const start = Date.now();
  try {
    const { actionRegistry } = await import('./actions/registry');
    const result = await actionRegistry.execute(
      action.action_type as import('./types').ActionType,
      action.config,
      { userId: profile.id, workspaceId: workflow.workspace_id, workflowId, runId: `debug-${Date.now()}`, variables: {}, stepOutputs: new Map() },
    );
    const duration = Date.now() - start;
    if (result.success) {
      return { output: (result.output ?? {}) as Record<string, unknown>, duration_ms: duration };
    } else {
      return { error: result.error ?? 'Unknown error', duration_ms: duration };
    }
  } catch (err) {
    const duration = Date.now() - start;
    return { error: err instanceof Error ? err.message : 'Unknown error', duration_ms: duration };
  }
}
