/**
 * Supa AI — Phase 9A Automation — Scheduler.
 *
 * Polls the `scheduled_jobs` table for rows whose `next_run_at` is at or
 * before `now()` and processes them: inserts a fresh `workflow_runs` row,
 * enqueues it on the background {@link RunQueue}, and bumps the
 * `scheduled_jobs` row's `last_run_at` + `next_run_at`.
 *
 * In production this is driven by an external cron hit (e.g. a Vercel
 * cron job calling `/api/automation/scheduler/tick`). For local dev the
 * scheduler can be called manually via the API route.
 *
 * Server-only.
 *
 * @module @/lib/automation/scheduler
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
import type { ScheduledJob, Workflow, WorkflowRun, WorkflowTrigger } from "./types";

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

/**
 * Parse a simple subset of cron expressions (minute / hour / day-of-month
 * / month / day-of-week, where each field is either an asterisk, an
 * integer, or a slash-step like 'slash-star-N'). Returns null when the
 * expression is not parseable.
 *
 * For Phase 9A this minimal parser is enough — the seeded templates
 * only use '0 9 * * *' (daily at 9am). A full cron parser belongs in
 * a follow-up Phase.
 */
function nextRunFromCron(cron: string, from: Date = new Date()): Date | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dow] = parts;
  const next = new Date(from.getTime() + 60 * 1000);
  next.setUTCSeconds(0, 0);

  const matches = (field: string, value: number, min: number, max: number): boolean => {
    if (field === "*") return true;
    if (field.startsWith("*/")) {
      const step = Number(field.slice(2));
      if (!Number.isFinite(step) || step <= 0) return false;
      return value % step === 0;
    }
    const n = Number(field);
    if (!Number.isFinite(n)) return false;
    return n === value;
  };

  // Try at most 7 days of minute-by-minute search.
  for (let i = 0; i < 7 * 24 * 60; i++) {
    if (
      matches(min, next.getUTCMinutes(), 0, 59) &&
      matches(hour, next.getUTCHours(), 0, 23) &&
      matches(dom, next.getUTCDate(), 1, 31) &&
      matches(month, next.getUTCMonth() + 1, 1, 12) &&
      matches(dow, next.getUTCDay(), 0, 6)
    ) {
      return next;
    }
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scheduler class
// ---------------------------------------------------------------------------

/**
 * Server-only scheduler. Constructed with the admin client.
 */
export class Scheduler {
  constructor(
    private readonly supabase: AdminSupabaseClient,
    private readonly executor: WorkflowExecutor,
    private readonly queue = runQueue,
  ) {}

  /**
   * Find every `scheduled_jobs` row whose `next_run_at` is at or before
   * `now()` (capped at a 50-row batch to keep the query cheap), execute
   * the corresponding workflow, and reschedule.
   *
   * Returns the list of started run ids. Idempotent — calling it twice
   * in the same tick will only run each due job once (the row's
   * `next_run_at` is bumped past `now()` before the run starts).
   */
  async checkScheduledJobs(now: Date = new Date()): Promise<string[]> {
    const nowIso = now.toISOString();

    let due: ScheduledJob[];
    try {
      const { data, error } = await this.supabase
        .from("scheduled_jobs")
        .select()
        .eq("is_active", true)
        .lte("next_run_at", nowIso)
        .order("next_run_at", { ascending: true })
        .limit(50);
      if (error) throw toDbError(error, "scheduler.loadDueJobs failed");
      due = (data ?? []) as unknown as ScheduledJob[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("scheduler.checkScheduledJobs failed", {
        cause: appErr.message,
      });
    }

    if (due.length === 0) return [];

    const runIds: string[] = [];
    for (const job of due) {
      try {
        const runId = await this.runJob(job, now);
        if (runId) runIds.push(runId);
      } catch (err) {
        logger.error("automation.scheduler.run_job_failed", {
          jobId: job.id,
          workflowId: job.workflow_id,
          cause: err instanceof Error ? err.message : String(err),
        });
        // Bump the job's `next_run_at` so we don't get stuck in a loop.
        await this.bumpNextRun(job, now);
      }
    }
    return runIds;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async runJob(job: ScheduledJob, now: Date): Promise<string | null> {
    // Look up the parent workflow + trigger to make sure they still exist
    // and the workflow is `active`.
    const [{ data: wfRow }, { data: trRow }] = await Promise.all([
      this.supabase.from("workflows").select().eq("id", job.workflow_id).maybeSingle(),
      this.supabase.from("workflow_triggers").select().eq("id", job.trigger_id).maybeSingle(),
    ]);
    const workflow = wfRow as unknown as Workflow | null;
    const trigger = trRow as unknown as WorkflowTrigger | null;
    if (!workflow || !trigger) {
      // Workflow or trigger was deleted — deactivate the job.
      await this.supabase
        .from("scheduled_jobs")
        .update({ is_active: false } as never)
        .eq("id", job.id);
      return null;
    }
    if (workflow.status !== "active") {
      // Skip — bump the next run so we don't immediately retry.
      await this.bumpNextRun(job, now);
      return null;
    }

    // Insert the run.
    const insert = {
      workspace_id: job.workspace_id,
      workflow_id: job.workflow_id,
      trigger_id: job.trigger_id,
      status: "pending" as const,
      metadata: toJson({
        scheduledJobId: job.id,
        scheduled: true,
        triggerConfig: trigger.config,
      }),
    };
    const { data: runRow, error: runErr } = await this.supabase
      .from("workflow_runs")
      .insert(insert as never)
      .select()
      .single();
    if (runErr) throw toDbError(runErr, "scheduler.insertRun failed");
    const run = runRow as unknown as WorkflowRun;

    // Bump the job's `next_run_at` (and `last_run_at`) so the next tick
    // doesn't double-fire.
    await this.bumpNextRun(job, now);

    // Enqueue for background processing.
    this.queue.enqueue(this.executor, run.id);
    return run.id;
  }

  private async bumpNextRun(job: ScheduledJob, now: Date): Promise<void> {
    let nextAt: Date | null = null;
    try {
      const { data: trRow } = await this.supabase
        .from("workflow_triggers")
        .select()
        .eq("id", job.trigger_id)
        .maybeSingle();
      const trigger = trRow as unknown as WorkflowTrigger | null;
      const cfg = (trigger?.config as Record<string, unknown> | null) ?? {};
      const cron = typeof cfg.cron === "string" ? cfg.cron : null;
      if (cron) nextAt = nextRunFromCron(cron, now);
      if (typeof cfg.intervalMinutes === "number") {
        nextAt = new Date(now.getTime() + cfg.intervalMinutes * 60 * 1000);
      }
    } catch {
      // Fall through — leave nextAt null.
    }
    const patch: Record<string, unknown> = {
      last_run_at: now.toISOString(),
    };
    if (nextAt) patch.next_run_at = nextAt.toISOString();
    else patch.is_active = false;

    try {
      await this.supabase
        .from("scheduled_jobs")
        .update(patch as never)
        .eq("id", job.id);
    } catch (err) {
      logger.warn("scheduler.bump_next_failed", {
        jobId: job.id,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
