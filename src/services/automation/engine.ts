/**
 * Core Workflow Engine — orchestrates workflow execution.
 * Supports sequential, parallel, and conditional execution modes.
 * Implements retry logic, timeout handling, and step tracking.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { logger } from "@/services/logger";
import { actionRegistry } from "./actions/registry";
import { substituteInValue } from "./variables";
import type {
  WorkflowRunStatus,
  TriggerType,
  ActionType,
  ExecutionMode,
  StepResult,
  LogLevel,
} from "./types";
import type { Json } from "@/types/generated/database";

// ─── Types ──────────────────────────────────────────────────────

interface TriggerExecutionRequest {
  triggerId?: string;
  workflowId?: string;
  workspaceId: string;
  userId?: string;
  triggerType: TriggerType;
  inputData: Json;
}

interface RunCreationResult {
  success: boolean;
  runId?: string;
  error?: string;
}

// ─── Run Creation ──────────────────────────────────────────────

async function createWorkflowRun(params: {
  workflowId: string;
  workspaceId: string;
  userId?: string;
  triggerType: TriggerType;
  triggerId?: string;
  inputData: Json;
}): Promise<RunCreationResult> {
  const supabase = await createServerSupabaseClient();

  // Get the current workflow version
  const { data: workflow } = await supabase
    .from("workflows")
    .select("id, status, version")
    .eq("id", params.workflowId)
    .single();

  if (!workflow || workflow.status !== "active") {
    return { success: false, error: "Workflow is not active or not found" };
  }

  const { data: version } = await supabase
    .from("workflow_versions")
    .select("id")
    .eq("workflow_id", params.workflowId)
    .eq("version_number", workflow.version)
    .single();

  const { data: run, error } = await supabase
    .from("workflow_runs")
    .insert({
      workflow_id: params.workflowId,
      workflow_version_id: version?.id ?? null,
      status: "pending" as WorkflowRunStatus,
      trigger_type: params.triggerType,
      trigger_id: params.triggerId ?? null,
      input_data: params.inputData,
      workspace_id: params.workspaceId,
      user_id: params.userId ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    logger.error("Failed to create workflow run", { error: error.message, workflowId: params.workflowId });
    return { success: false, error: error.message };
  }

  return { success: true, runId: run.id };
}

// ─── Run Status Updates ────────────────────────────────────────

async function updateRunStatus(
  runId: string,
  status: WorkflowRunStatus,
  extras?: Partial<{
    current_step_id: string | null;
    previous_step_id: string | null;
    error_message: string;
    error_details: Json;
    output_data: Json;
    retry_count: number;
    ended_at: string;
    duration_ms: number | null;
  }>,
): Promise<void> {
  const supabase = await createAdminClient();
  const update: Record<string, unknown> = { status };

  if (extras) {
    Object.assign(update, extras);
  }

  const { error } = await supabase
    .from("workflow_runs")
    .update(update)
    .eq("id", runId);

  if (error) {
    logger.error("Failed to update run status", { runId, status, error: error.message });
  }
}

// ─── Log Writing ───────────────────────────────────────────────

async function writeLog(params: {
  runId: string;
  workflowId: string;
  actionId?: string;
  level: LogLevel;
  message: string;
  details?: Json;
  durationMs?: number | null;
  stepPosition?: number | null;
  workspaceId: string;
}): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase.from("workflow_logs").insert({
    run_id: params.runId,
    workflow_id: params.workflowId,
    action_id: params.actionId ?? null,
    level: params.level,
    message: params.message,
    details: params.details ?? {},
    duration_ms: params.durationMs ?? null,
    step_position: params.stepPosition ?? null,
    workspace_id: params.workspaceId,
  });

  if (error) {
    logger.error("Failed to write workflow log", { runId: params.runId, error: error.message });
  }
}

// ─── Load Actions for a Workflow ───────────────────────────────

async function loadWorkflowActions(workflowId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_actions")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("is_enabled", true)
    .order("step_position", { ascending: true });

  if (error) {
    logger.error("Failed to load workflow actions", { workflowId, error: error.message });
    return [];
  }
  return data ?? [];
}

// ─── Load Variables for a Workflow ─────────────────────────────

async function loadWorkflowVariables(workflowId: string, runId?: string) {
  const supabase = await createServerSupabaseClient();
  const query = supabase
    .from("workflow_variables")
    .select("name, value, scope")
    .eq("workflow_id", workflowId);

  if (runId) {
    query.eq("run_id", runId);
  } else {
    query.is("run_id", null);
  }

  const { data } = await query;
  const vars: Record<string, unknown> = {};
  for (const v of data ?? []) {
    vars[v.name] = v.value;
  }
  return vars;
}

// ─── Execute a Single Action ───────────────────────────────────

async function executeSingleAction(
  action: {
    id: string;
    name: string;
    action_type: ActionType;
    config: Json;
    step_position: number;
    retry_limit: number;
    timeout_ms: number;
    on_failure: string;
  },
  context: {
    runId: string;
    workflowId: string;
    workspaceId: string;
    userId?: string;
    variables: Record<string, unknown>;
  },
): Promise<StepResult> {
  const startTime = Date.now();

  // Substitute variables in action config
  const resolvedConfig = substituteInValue(action.config, context.variables);

  await writeLog({
    runId: context.runId,
    workflowId: context.workflowId,
    actionId: action.id,
    level: "info",
    message: `Executing action: ${action.name} (${action.action_type})`,
    stepPosition: action.step_position,
    workspaceId: context.workspaceId,
  });

  // Execute with timeout
  const timeoutMs = Math.max(action.timeout_ms, 5000);
  let result: Awaited<ReturnType<typeof actionRegistry.execute>>;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Action timeout after ${timeoutMs}ms`)), timeoutMs),
  );

  try {
    result = await Promise.race([
      actionRegistry.execute(
        action.action_type,
        resolvedConfig,
        {
          runId: context.runId,
          workflowId: context.workflowId,
          workspaceId: context.workspaceId,
          userId: context.userId,
          variables: context.variables,
          stepOutputs: new Map(),
        },
      ),
      timeoutPromise,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      actionId: action.id,
      actionName: action.name,
      actionType: action.action_type,
      success: false,
      error: message,
      durationMs: Date.now() - startTime,
      stepPosition: action.step_position,
    };
  }

  const durationMs = Date.now() - startTime;

  await writeLog({
    runId: context.runId,
    workflowId: context.workflowId,
    actionId: action.id,
    level: result.success ? "info" : "error",
    message: result.success
      ? `Action completed: ${action.name}`
      : `Action failed: ${action.name} — ${result.error}`,
    details: { success: result.success, output: result.output, error: result.error } as unknown as Json,
    durationMs,
    stepPosition: action.step_position,
    workspaceId: context.workspaceId,
  });

  return {
    actionId: action.id,
    actionName: action.name,
    actionType: action.action_type,
    success: result.success,
    output: result.output,
    error: result.error,
    durationMs,
    stepPosition: action.step_position,
  };
}

// ─── Retry Logic ───────────────────────────────────────────────

async function executeWithRetry(
  action: {
    id: string;
    name: string;
    action_type: ActionType;
    config: Json;
    step_position: number;
    retry_limit: number;
    timeout_ms: number;
    on_failure: string;
  },
  context: {
    runId: string;
    workflowId: string;
    workspaceId: string;
    userId?: string;
    variables: Record<string, unknown>;
  },
  maxRetries: number,
): Promise<StepResult> {
  let lastResult: StepResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await executeSingleAction(action, context);

    if (lastResult.success) return lastResult;

    // Check if retry is appropriate
    if (attempt < maxRetries && !lastResult.error?.includes("timeout")) {
      // Exponential backoff: 1s, 2s, 4s, 8s...
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000);
      await writeLog({
        runId: context.runId,
        workflowId: context.workflowId,
        actionId: action.id,
        level: "warn",
        message: `Retrying action ${action.name} (attempt ${attempt + 1}/${maxRetries}) in ${backoffMs}ms`,
        stepPosition: action.step_position,
        workspaceId: context.workspaceId,
      });
      await new Promise((r) => setTimeout(r, backoffMs));
    } else {
      break;
    }
  }

  return lastResult!;
}

// ─── Sequential Execution ──────────────────────────────────────

async function executeSequential(
  actions: ReturnType<typeof loadWorkflowActions> extends Promise<infer T> ? T : never,
  context: {
    runId: string;
    workflowId: string;
    workspaceId: string;
    userId?: string;
    variables: Record<string, unknown>;
  },
): Promise<{ completed: boolean; outputs: Record<string, unknown> }> {
  const outputs: Record<string, unknown> = {};

  for (const action of actions) {
    // Check for condition action — branch evaluation
    if (action.action_type === "condition") {
      const result = await executeWithRetry(action, context, action.retry_limit);
      outputs[`step_${action.step_position}`] = result.output;

      if (result.success && result.output) {
        const branchResult = result.output as { conditionResult?: boolean; branch?: string };
        // If condition is false and on_failure is 'continue', skip to next
        if (!branchResult.conditionResult) {
          await writeLog({
            runId: context.runId,
            workflowId: context.workflowId,
            actionId: action.id,
            level: "info",
            message: "Condition evaluated to false, continuing to next action",
            stepPosition: action.step_position,
            workspaceId: context.workspaceId,
          });
        }
      }
      continue;
    }

    const result = await executeWithRetry(action, context, action.retry_limit);
    outputs[`step_${action.step_position}`] = result.output;

    if (!result.success) {
      if (action.on_failure === "continue") {
        await writeLog({
          runId: context.runId,
          workflowId: context.workflowId,
          actionId: action.id,
          level: "warn",
          message: `Action failed but on_failure='continue': ${result.error}`,
          stepPosition: action.step_position,
          workspaceId: context.workspaceId,
        });
        continue;
      }

      return { completed: false, outputs };
    }

    // Update current step in the run
    await updateRunStatus(context.runId, "running", {
      current_step_id: action.id,
    });

    // Merge step output into variables for subsequent steps
    if (result.output && typeof result.output === "object") {
      Object.assign(context.variables, result.output);
    }
  }

  return { completed: true, outputs };
}

// ─── Parallel Execution ────────────────────────────────────────

async function executeParallel(
  actions: ReturnType<typeof loadWorkflowActions> extends Promise<infer T> ? T : never,
  context: {
    runId: string;
    workflowId: string;
    workspaceId: string;
    userId?: string;
    variables: Record<string, unknown>;
  },
): Promise<{ completed: boolean; outputs: Record<string, unknown> }> {
  const results = await Promise.allSettled(
    actions.map(async (action) => {
      const result = await executeWithRetry(action, context, action.retry_limit);
      return { ...result, stepPosition: action.step_position };
    }),
  );

  const outputs: Record<string, unknown> = {};
  let allSuccess = true;

  for (const result of results) {
    if (result.status === "fulfilled") {
      outputs[`step_${result.value.stepPosition}`] = result.value.output;
      if (!result.value.success) allSuccess = false;
    } else {
      allSuccess = false;
    }
  }

  return { completed: allSuccess, outputs };
}

// ─── Main Execution Orchestrator ───────────────────────────────

async function executeWorkflowInternal(
  workflowId: string,
  workspaceId: string,
  userId: string | undefined,
  triggerType: TriggerType,
  triggerId: string | undefined,
  inputData: Json,
): Promise<void> {
  // 1. Create the run record
  const { success: runCreated, runId, error: runError } = await createWorkflowRun({
    workflowId,
    workspaceId,
    userId,
    triggerType,
    triggerId,
    inputData,
  });

  if (!runCreated || !runId) {
    logger.error("Failed to create workflow run", { workflowId, error: runError });
    return;
  }

  const startedAt = Date.now();
  await updateRunStatus(runId, "running");

  try {
    // 2. Load workflow actions and variables
    const [actions, globalVars] = await Promise.all([
      loadWorkflowActions(workflowId),
      loadWorkflowVariables(workflowId),
    ]);

    if (actions.length === 0) {
      await writeLog({
        runId,
        workflowId,
        level: "warn",
        message: "Workflow has no enabled actions",
        workspaceId,
      });
      await completeRun(runId, "completed", startedAt, {}, workspaceId, workflowId);
      return;
    }

    // 3. Merge input data into variables
    const variables: Record<string, unknown> = {
      ...globalVars,
      ...(inputData as Record<string, unknown>),
      trigger: { type: triggerType, id: triggerId },
    };

    const context = { runId, workflowId, workspaceId, userId, variables };

    // 4. Get execution mode from workflow
    const supabase = await createServerSupabaseClient();
    const { data: workflow } = await supabase
      .from("workflows")
      .select("execution_mode")
      .eq("id", workflowId)
      .single();

    const executionMode: ExecutionMode = (workflow?.execution_mode as ExecutionMode) ?? "sequential";

    // 5. Execute based on mode
    let result: { completed: boolean; outputs: Record<string, unknown> };

    if (executionMode === "parallel") {
      result = await executeParallel(actions, context);
    } else {
      result = await executeSequential(actions, context);
    }

    // 6. Complete the run
    const finalStatus = result.completed ? "completed" : "failed";
    await completeRun(runId, finalStatus, startedAt, result.outputs, workspaceId, workflowId);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Workflow execution failed", { runId, workflowId, error: message });
    await updateRunStatus(runId, "failed", {
      error_message: message,
      error_details: { stack: error instanceof Error ? error.stack : undefined },
    });
    await completeRun(runId, "failed", startedAt, {}, workspaceId, workflowId);
  }
}

/**
 * Mark a run as complete with end time and duration.
 */
async function completeRun(
  runId: string,
  status: WorkflowRunStatus,
  startedAt: number,
  outputs: Record<string, unknown>,
  workspaceId: string,
  workflowId: string,
): Promise<void> {
  const endedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;

  await updateRunStatus(runId, status, {
    ended_at: endedAt,
    duration_ms: durationMs,
    output_data: outputs as unknown as Json,
    current_step_id: null,
  });

  await writeLog({
    runId,
    workflowId,
    level: status === "completed" ? "info" : "error",
    message: `Workflow run ${status} (${durationMs}ms)`,
    details: { status, durationMs },
    workspaceId,
  });
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Execute a workflow triggered by a trigger event.
 */
export async function executeWorkflowByTrigger(request: TriggerExecutionRequest): Promise<string | null> {
  const { triggerId, workflowId, workspaceId, userId, triggerType, inputData } = request;

  // If we have a triggerId, look up the workflowId
  let targetWorkflowId = workflowId;
  if (!targetWorkflowId && triggerId) {
    const supabase = await createServerSupabaseClient();
    const { data: trigger } = await supabase
      .from("workflow_triggers")
      .select("workflow_id")
      .eq("id", triggerId)
      .single();
    targetWorkflowId = trigger?.workflow_id;
  }

  if (!targetWorkflowId) {
    logger.warn("No workflow found for trigger", { triggerId, workflowId });
    return null;
  }

  // Execute in background (fire-and-forget for event-driven)
  void executeWorkflowInternal(
    targetWorkflowId,
    workspaceId,
    userId,
    triggerType,
    triggerId,
    inputData,
  );

  return targetWorkflowId;
}

/**
 * Execute a workflow manually (synchronous — waits for completion).
 */
export async function executeWorkflowManually(params: {
  workflowId: string;
  workspaceId: string;
  userId: string;
  inputData?: Json;
}): Promise<{ success: boolean; runId?: string; error?: string }> {
  const { workflowId, workspaceId, userId, inputData = {} } = params;

  const { success, runId, error } = await createWorkflowRun({
    workflowId,
    workspaceId,
    userId,
    triggerType: "manual",
    inputData,
  });

  if (!success || !runId) {
    return { success: false, error };
  }

  // Execute synchronously
  const startedAt = Date.now();
  await updateRunStatus(runId, "running");

  try {
    const [actions, globalVars] = await Promise.all([
      loadWorkflowActions(workflowId),
      loadWorkflowVariables(workflowId),
    ]);

    const variables: Record<string, unknown> = {
      ...globalVars,
      ...(inputData as Record<string, unknown>),
      trigger: { type: "manual" },
    };

    const supabase = await createServerSupabaseClient();
    const { data: workflow } = await supabase
      .from("workflows")
      .select("execution_mode")
      .eq("id", workflowId)
      .single();

    const executionMode: ExecutionMode = (workflow?.execution_mode as ExecutionMode) ?? "sequential";
    const context = { runId, workflowId, workspaceId, userId, variables };

    const result = executionMode === "parallel"
      ? await executeParallel(actions, context)
      : await executeSequential(actions, context);

    const finalStatus = result.completed ? "completed" : "failed";
    await completeRun(runId, finalStatus, startedAt, result.outputs, workspaceId, workflowId);

    return { success: result.completed, runId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunStatus(runId, "failed", {
      error_message: message,
    });
    return { success: false, runId, error: message };
  }
}

/**
 * Stop a running workflow.
 */
export async function stopWorkflowRun(
  runId: string,
  workspaceId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: run, error } = await supabase
    .from("workflow_runs")
    .select("id, status")
    .eq("id", runId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !run) {
    return { success: false, error: "Run not found" };
  }

  if (run.status !== "running" && run.status !== "pending" && run.status !== "retrying") {
    return { success: false, error: `Cannot stop run in status: ${run.status}` };
  }

  await updateRunStatus(runId, "cancelled");
  logger.info("Workflow run cancelled", { runId, workspaceId });
  return { success: true };
}

/**
 * Retry a failed workflow run.
 */
export async function retryWorkflowRun(
  runId: string,
  workspaceId: string,
): Promise<{ success: boolean; newRunId?: string; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: originalRun, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !originalRun) {
    return { success: false, error: "Run not found" };
  }

  if (originalRun.status !== "failed" && originalRun.status !== "cancelled") {
    return { success: false, error: "Only failed or cancelled runs can be retried" };
  }

  // Create a new run with the same input
  const { success, runId: newRunId } = await createWorkflowRun({
    workflowId: originalRun.workflow_id,
    workspaceId,
    userId: originalRun.user_id ?? undefined,
    triggerType: originalRun.trigger_type,
    inputData: originalRun.input_data,
  });

  if (!success || !newRunId) {
    return { success: false, error: "Failed to create retry run" };
  }

  // Execute in background
  void executeWorkflowInternal(
    originalRun.workflow_id,
    workspaceId,
    originalRun.user_id ?? undefined,
    originalRun.trigger_type,
    originalRun.trigger_id ?? undefined,
    originalRun.input_data,
  );

  return { success: true, newRunId };
}
