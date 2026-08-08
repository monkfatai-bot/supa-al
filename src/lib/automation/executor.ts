/**
 * Supa AI — Phase 9A Automation — Workflow Executor.
 *
 * The single, canonical execution path for a workflow run. Given a run id
 * (already inserted by the service or dispatcher), the executor:
 *
 *   1. Loads the run row + workflow + actions + variables.
 *   2. Marks the run `running` and records `started_at`.
 *   3. Resolves workflow variables + trigger payload into a flat scope.
 *   4. Walks the actions in `order`, resolving `{{...}}` placeholders in
 *      each action's config via {@link VariableResolver}, then dispatching
 *      to the matching {@link ActionHandler}.
 *   5. Captures each action's output into the run's `metadata.outputs` map.
 *   6. On success: marks the run `completed`, writes the final result.
 *   7. On failure: marks the run `failed`, records the error message,
 *      logs a single `error`-level {@link WorkflowLog} row.
 *
 * The executor is intentionally synchronous-in-order. Concurrent action
 * execution belongs in a follow-up Phase (a `parallel` action group).
 *
 * Server-only: depends on the admin client, logger, registry, resolver.
 *
 * @module @/lib/automation/executor
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { decrypt } from "@/lib/security/crypto";
import type { AnySupabaseClient } from "@/lib/auth/helpers";

import { actionRegistry } from "./registry";
import { variableResolver } from "./resolver";
import type {
  ActionHandler,
  WorkflowAction,
  WorkflowExecutionContext,
  WorkflowExecutionResult,
  WorkflowLog,
  WorkflowLogLevel,
  WorkflowRun,
  WorkflowVariable,
} from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Postgres-safe JSON value (mirrors the local type in supabase/types). */
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Map a Postgrest-shaped error into a {@link DatabaseError}. Centralized
 * so the call sites stay narrow.
 */
function toDbError(
  error: { code?: string; message?: string; name?: string; details?: unknown },
  message: string,
): DatabaseError {
  return new DatabaseError(message, {
    errorCode: error.code,
    errorName: error.name,
    errorMessage: error.message,
    errorDetails: error.details,
  });
}

/** Coerce an arbitrary value into a Postgres-safe `Json` payload. */
function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value as unknown as Json;
  return value as Json;
}

/**
 * Convert a `workflow_variables` row into a scope entry. Secret variables
 * are masked (the resolved scope only carries a `[secret]` placeholder —
 * handlers that need the actual value must read it from the DB).
 */
function variableToScope(v: WorkflowVariable): [string, unknown] {
  if (v.is_secret) return [v.key, v.value ? decrypt(v.value) : ""];
  if (v.type === "number") {
    const n = Number(v.value ?? 0);
    return [v.key, Number.isFinite(n) ? n : null];
  }
  if (v.type === "boolean") {
    return [v.key, v.value === "true" || v.value === "1"];
  }
  if (v.type === "json") {
    try {
      return [v.key, v.value ? JSON.parse(v.value) : null];
    } catch {
      return [v.key, v.value];
    }
  }
  return [v.key, v.value];
}

// ---------------------------------------------------------------------------
// Executor class
// ---------------------------------------------------------------------------

/**
 * Server-only executor. Constructed with the **admin** Supabase client so
 * it can write `workflow_runs`, `workflow_logs`, and (eventually)
 * arbitrary workspace tables when `create_record`/`update_record`
 * handlers are wired to real table writes.
 */
export class WorkflowExecutor {
  constructor(
    private readonly supabase: AnySupabaseClient,
    private readonly registry: { find(type: string): ActionHandler | undefined } = actionRegistry,
  ) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute a single run end-to-end. The run row must already exist
   * (inserted by the service layer or the dispatcher). Returns the
   * final {@link WorkflowExecutionResult} — never throws on action
   * failure (the run is marked `failed` and the result carries the
   * error message). Throws only on infrastructure failure (DB write
   * failure, missing run row, etc.).
   */
  async executeWorkflow(runId: string): Promise<WorkflowExecutionResult> {
    const startedAt = new Date();
    const startedAtIso = startedAt.toISOString();

    // 1. Load the run + workflow + actions + variables.
    const { data: runRow, error: runErr } = await this.supabase
      .from("workflow_runs")
      .select()
      .eq("id", runId)
      .maybeSingle();
    if (runErr) throw toDbError(runErr, "executor.loadRun failed");
    if (!runRow) throw new NotFoundError("WorkflowRun", runId);

    const run = runRow as WorkflowRun;
    const { workspace_id, workflow_id, trigger_id } = run;

    // 2. Mark the run `running`.
    await this.updateRun(runId, {
      status: "running",
      started_at: startedAtIso,
    });

    // 3. Load actions + variables.
    const [actions, variables] = await Promise.all([
      this.loadActions(workflow_id),
      this.loadVariables(workflow_id),
    ]);

    if (actions.length === 0) {
      // Nothing to do — complete immediately.
      const completedAt = new Date();
      await this.updateRun(runId, {
        status: "completed",
        completed_at: completedAt.toISOString(),
        result: toJson({ outputs: {} }),
      });
      return {
        runId,
        status: "completed",
        outputs: {},
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };
    }

    // 4. Build the execution context.
    const scopeVars: Record<string, unknown> = {};
    for (const v of variables) {
      const [k, val] = variableToScope(v);
      scopeVars[k] = val;
    }
    const payload = (run.metadata as Record<string, unknown> | null)?.payload ?? {};
    const ctx: WorkflowExecutionContext = {
      runId,
      workspaceId: workspace_id,
      workflowId: workflow_id,
      triggerId: trigger_id,
      variables: scopeVars,
      payload: payload as Record<string, unknown>,
      outputs: {},
      startedAt: startedAtIso,
    };

    await this.appendLog(runId, "info", `Starting workflow run with ${actions.length} action(s).`, {
      workflowId: workflow_id,
      actionCount: actions.length,
    });

    // 5. Walk the actions in order.
    let failed = false;
    let errorMessage: string | undefined;
    try {
      for (const action of actions) {
        if (!action.is_active) continue;
        const handler = this.registry.find(action.type);
        if (!handler) {
          throw new Error(`No handler registered for action type "${action.type}".`);
        }
        const resolvedConfig = variableResolver.resolve<Record<string, unknown>>(
          (action.config as Record<string, unknown>) ?? {},
          {
            variables: ctx.variables,
            payload: ctx.payload,
            outputs: ctx.outputs,
          },
        );
        await this.appendLog(runId, "info", `Running action #${action.order}: ${action.name} (${action.type}).`, {
          actionId: action.id,
          actionType: action.type,
        });
        const output = await handler.execute(resolvedConfig, ctx);
        ctx.outputs[action.order] = output;
        await this.updateRun(runId, {
          metadata: toJson({ ...(run.metadata as Record<string, unknown> ?? {}), outputs: ctx.outputs }),
        });
      }
    } catch (err) {
      failed = true;
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("automation.executor.action_failed", {
        runId,
        workflowId: workflow_id,
        error: errorMessage,
      });
      await this.appendLog(runId, "error", `Action failed: ${errorMessage}`, {
        workflowId: workflow_id,
      });
    }

    // 6. Finalize the run.
    const completedAt = new Date();
    const status: WorkflowRun["status"] = failed ? "failed" : "completed";
    await this.updateRun(runId, {
      status,
      completed_at: completedAt.toISOString(),
      error: failed ? errorMessage : null,
      result: toJson({ outputs: ctx.outputs }),
    });

    if (!failed) {
      await this.appendLog(runId, "info", "Workflow run completed.", {
        durationMs: completedAt.getTime() - startedAt.getTime(),
      });
    }

    return {
      runId,
      status,
      outputs: ctx.outputs,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      error: failed ? errorMessage : undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Private loaders + writers
  // -----------------------------------------------------------------------

  private async loadActions(workflowId: string): Promise<WorkflowAction[]> {
    const { data, error } = await this.supabase
      .from("workflow_actions")
      .select()
      .eq("workflow_id", workflowId)
      .eq("is_active", true)
      .order("order", { ascending: true });
    if (error) throw toDbError(error, "executor.loadActions failed");
    return (data ?? []) as unknown as WorkflowAction[];
  }

  private async loadVariables(workflowId: string): Promise<WorkflowVariable[]> {
    const { data, error } = await this.supabase
      .from("workflow_variables")
      .select()
      .eq("workflow_id", workflowId);
    if (error) throw toDbError(error, "executor.loadVariables failed");
    return (data ?? []) as unknown as WorkflowVariable[];
  }

  private async updateRun(
    runId: string,
    patch: Partial<WorkflowRun>,
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = {};
    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.started_at !== undefined) updatePayload.started_at = patch.started_at;
    if (patch.completed_at !== undefined) updatePayload.completed_at = patch.completed_at;
    if (patch.error !== undefined) updatePayload.error = patch.error;
    if (patch.result !== undefined) updatePayload.result = patch.result;
    if (patch.metadata !== undefined) updatePayload.metadata = patch.metadata;
    const { error } = await this.supabase
      .from("workflow_runs")
      .update(updatePayload as never)
      .eq("id", runId);
    if (error) throw toDbError(error, "executor.updateRun failed");
  }

  private async appendLog(
    runId: string,
    level: WorkflowLogLevel,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.supabase.from("workflow_logs").insert({
        run_id: runId,
        level,
        message,
        details: details ? toJson(details) : null,
      } as never);
    } catch (err) {
      // Logging failures must never break a run — log + move on.
      logger.warn("automation.executor.log_failed", {
        runId,
        level,
        cause: toAppError(err).message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Unused-but-referenced public surface (kept narrow to avoid leaking
  // internals — exported only via the queue + service).
  // -----------------------------------------------------------------------

  /** Expose the log writer so external code can attach ad-hoc logs. */
  async writeLog(
    runId: string,
    level: WorkflowLogLevel,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<WorkflowLog | null> {
    const { data, error } = await this.supabase
      .from("workflow_logs")
      .insert({
        run_id: runId,
        level,
        message,
        details: details ? toJson(details) : null,
      } as never)
      .select()
      .single();
    if (error) throw toDbError(error, "executor.writeLog failed");
    return data as unknown as WorkflowLog;
  }
}
