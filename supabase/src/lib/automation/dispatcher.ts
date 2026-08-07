/**
 * Supa AI — Phase 9A Automation — Trigger Dispatcher.
 *
 * The single entry point for *event-driven* workflow execution. When
 * something happens in the platform (a contact is created, a document
 * is published, a webhook fires), the calling code calls
 * {@link TriggerDispatcher.dispatchEvent} with the event name + payload.
 *
 * The dispatcher:
 *
 *   1. Looks up every `workflow_triggers` row of `type = 'event'` whose
 *      `config.event` matches the dispatched event.
 *   2. For each matching trigger, checks that the parent workflow is
 *      `active`.
 *   3. Inserts a `workflow_runs` row (status `pending`).
 *   4. Enqueues the run on the background {@link RunQueue} for execution.
 *
 * The dispatcher never blocks on the run's outcome — that's the queue's
 * job. The function returns the list of started run ids so the caller
 * can correlate (and the API can return them to the client).
 *
 * Server-only.
 *
 * @module @/lib/automation/dispatcher
 */
import "server-only";

import {
  DatabaseError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import { WorkflowExecutor } from "./executor";
import { runQueue } from "./queue";
import type {
  DispatchEventInput,
  Workflow,
  WorkflowRun,
  WorkflowTrigger,
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

function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value as unknown as Json;
  return value as Json;
}

// ---------------------------------------------------------------------------
// Dispatcher class
// ---------------------------------------------------------------------------

/**
 * Server-only trigger dispatcher. Constructed with the admin client.
 * Each `dispatchEvent` call results in zero or more new `workflow_runs`
 * rows (one per matching trigger) — the runs themselves are processed
 * asynchronously by the {@link RunQueue}.
 */
export class TriggerDispatcher {
  constructor(
    private readonly supabase: AdminSupabaseClient,
    private readonly executor: WorkflowExecutor,
    private readonly queue = runQueue,
  ) {}

  /**
   * Dispatch an event. Returns the list of run ids that were started.
   * Empty when no matching trigger is found (this is not an error —
   * the platform emits many events that no workflow listens to).
   */
  async dispatchEvent(input: DispatchEventInput): Promise<string[]> {
    const { event, payload = {} } = input;

    let triggers: Array<WorkflowTrigger & { workflow: Workflow }>;
    try {
      // Use a join so we only get triggers whose parent workflow is active.
      // The `workflow_triggers` table has no FK-typed join exposed via
      // Postgrest's typed select helper (because we hand-wrote the
      // Database type without relationships), so we fall back to two
      // queries: matching triggers first, then their parent workflows.
      const { data: triggerRows, error: trErr } = await this.supabase
        .from("workflow_triggers")
        .select()
        .eq("type", "event")
        .eq("is_active", true);
      if (trErr) throw toDbError(trErr, "dispatcher.loadTriggers failed");

      const candidates = (triggerRows ?? []) as unknown as WorkflowTrigger[];
      const matching = candidates.filter((t) => {
        const cfg = t.config as Record<string, unknown> | null;
        return cfg?.event === event;
      });
      if (matching.length === 0) return [];

      const workflowIds = Array.from(new Set(matching.map((t) => t.workflow_id)));
      const { data: workflowRows, error: wfErr } = await this.supabase
        .from("workflows")
        .select()
        .in("id", workflowIds)
        .eq("status", "active");
      if (wfErr) throw toDbError(wfErr, "dispatcher.loadWorkflows failed");

      const workflowsById = new Map<string, Workflow>();
      for (const w of (workflowRows ?? []) as unknown as Workflow[]) {
        workflowsById.set(w.id, w);
      }
      triggers = matching
        .filter((t) => workflowsById.has(t.workflow_id))
        .map((t) => Object.assign(t, { workflow: workflowsById.get(t.workflow_id)! }));
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("dispatcher.dispatchEvent failed", {
        event,
        cause: appErr.message,
      });
    }

    if (triggers.length === 0) return [];

    const runIds: string[] = [];
    for (const trigger of triggers) {
      try {
        const runId = await this.startRun(trigger, payload);
        if (runId) runIds.push(runId);
      } catch (err) {
        logger.error("automation.dispatcher.start_run_failed", {
          event,
          triggerId: trigger.id,
          workflowId: trigger.workflow_id,
          cause: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return runIds;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async startRun(
    trigger: WorkflowTrigger & { workflow: Workflow },
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const workflow = trigger.workflow;
    const insert = {
      workspace_id: workflow.workspace_id,
      workflow_id: workflow.id,
      trigger_id: trigger.id,
      status: "pending" as const,
      metadata: toJson({ payload, event: (trigger.config as Record<string, unknown> | null)?.event ?? null }),
    };
    const { data, error } = await this.supabase
      .from("workflow_runs")
      .insert(insert as never)
      .select()
      .single();
    if (error) throw toDbError(error, "dispatcher.insertRun failed");
    const run = data as unknown as WorkflowRun;
    this.queue.enqueue(this.executor, run.id);
    return run.id;
  }
}
