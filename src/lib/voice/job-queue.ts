/**
 * Supa AI — Voice job queue (Phase 8).
 *
 * Owns the `voice_jobs` table for tracking background / async voice
 * operations (translation, dubbing, cloning, async STT/TTS). Provides
 * CRUD, retry/cancel helpers, and a background-processor runner.
 *
 * The runner is invoked via `setImmediate` (from the API route) — there
 * is no separate worker process in Phase 8; the same Node.js process
 * that handled the HTTP request continues execution outside the request
 * lifecycle to drive the provider call to completion.
 *
 * @module @/lib/voice/job-queue
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import type {
  VoiceJob,
  VoiceJobInsert,
  VoiceJobUpdate,
} from "./types";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class JobQueueService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /** Create a new job row. */
  async create(input: VoiceJobInsert): Promise<VoiceJob> {
    try {
      const { data, error } = await this.supabase
        .from("voice_jobs")
        .insert(input)
        .select()
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_jobs.insert failed");
      if (!data) {
        throw new DatabaseError("voice_jobs.insert returned no row.", {
          workspaceId: input.workspace_id,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating voice job.", {
        cause: appErr.message,
      });
    }
  }

  /** Patch a job row. */
  async update(
    workspaceId: string,
    id: string,
    patch: VoiceJobUpdate,
  ): Promise<VoiceJob> {
    try {
      const { data, error } = await this.supabase
        .from("voice_jobs")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_jobs.update failed");
      if (!data) throw new NotFoundError("Voice job", id);
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating voice job.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /** Get a single job. */
  async get(workspaceId: string, id: string): Promise<VoiceJob | null> {
    try {
      const { data, error } = await this.supabase
        .from("voice_jobs")
        .select()
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_jobs.get failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading voice job.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /** List jobs for the workspace (most-recent first). */
  async list(
    workspaceId: string,
    opts: {
      status?: string;
      generationId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<VoiceJob[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      let query = this.supabase
        .from("voice_jobs")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.status) query = query.eq("status", opts.status as never);
      if (opts.generationId) query = query.eq("generation_id", opts.generationId);
      const { data, error } = await query;
      if (error) throw this.toDbError(error, "voice_jobs.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing voice jobs.", {
        workspaceId,
        cause: appErr.message,
      });
    }
  }

  /** Mark a job for retry (resets status to 'pending'). */
  async retry(workspaceId: string, id: string): Promise<VoiceJob> {
    const job = await this.get(workspaceId, id);
    if (!job) throw new NotFoundError("Voice job", id);
    if (job.status === "processing") {
      throw new ValidationError("Cannot retry a job that is currently processing.");
    }
    return this.update(workspaceId, id, {
      status: "pending",
      progress: 0,
      error: null,
      started_at: null,
      completed_at: null,
    });
  }

  /** Mark a job as cancelled. */
  async cancel(workspaceId: string, id: string): Promise<VoiceJob> {
    const job = await this.get(workspaceId, id);
    if (!job) throw new NotFoundError("Voice job", id);
    if (job.status === "completed") {
      throw new ValidationError("Cannot cancel a completed job.");
    }
    return this.update(workspaceId, id, {
      status: "cancelled",
      completed_at: new Date().toISOString(),
    });
  }

  /**
   * Run a background processor function with proper job-state transitions.
   * Used by `voice-service` to wrap async provider calls (translate / dub /
   * clone). The processor function should:
   *   - Update `progress` via {@link JobQueueService.update}.
   *   - Throw an {@link Error} on failure (this method records the message
   *     in `voice_jobs.error` and sets `status='failed'`).
   *   - Return a `result_url` (when the provider gives one) for the
   *     caller to persist on the parent `voice_generations` row.
   *
   * Returns the final `voice_jobs` row.
   */
  async run(
    workspaceId: string,
    jobId: string,
    processor: (job: VoiceJob) => Promise<string | null>,
  ): Promise<VoiceJob> {
    await this.update(workspaceId, jobId, {
      status: "processing",
      progress: 0,
      started_at: new Date().toISOString(),
    });
    try {
      const current = await this.get(workspaceId, jobId);
      if (!current) throw new NotFoundError("Voice job", jobId);
      const resultUrl = await processor(current);
      const patch: VoiceJobUpdate = {
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
      };
      if (resultUrl) patch.result_url = resultUrl;
      return await this.update(workspaceId, jobId, patch);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("voice job failed", { workspaceId, jobId, error: message });
      try {
        return await this.update(workspaceId, jobId, {
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        });
      } catch (updateErr) {
        // The update itself failed — log and surface the original error.
        logger.error("failed to mark voice job as failed", {
          workspaceId,
          jobId,
          cause: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
        throw err;
      }
    }
  }

  private toDbError(
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
}

/** Build the canonical {@link JobQueueService}. */
export function createJobQueueService(): JobQueueService {
  const supabase = createSupabaseAdminClient();
  return new JobQueueService(supabase);
}

/**
 * Schedule a background processor via `setImmediate`. The HTTP request
 * handler returns immediately; the processor runs in the same Node.js
 * process outside the request lifecycle. Errors are logged + recorded
 * on the job row (best-effort).
 */
export function scheduleBackgroundJob(
  workspaceId: string,
  jobId: string,
  queue: JobQueueService,
  processor: (job: VoiceJob) => Promise<string | null>,
): void {
  setImmediate(() => {
    void queue
      .run(workspaceId, jobId, processor)
      .catch((err) => {
        logger.error("voice background job crashed", {
          workspaceId,
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });
}
