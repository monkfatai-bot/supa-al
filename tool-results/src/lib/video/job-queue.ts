/**
 * Supa AI — Phase 5 AI Video — background job queue.
 *
 * The video generation flow is async: most providers return an
 * `externalJobId` immediately and require polling for the final URL.
 * This module owns that lifecycle.
 *
 * Two responsibilities:
 *
 *   1. `enqueueRunJob` — defers the actual provider call to the next
 *      Node event-loop tick via `setImmediate`. The API route returns
 *      the persisted `video_generations` row immediately; the deferred
 *      callback mutates the row as the provider reports progress.
 *
 *   2. `pollJob` — refreshes a job's status from the provider. Called
 *      by the `/api/video/jobs/[id]` GET route each time the client
 *      polls, so the DB row stays fresh without a separate cron.
 *
 * Status flow: `pending → processing → completed | failed | cancelled`.
 *
 * @module @/lib/video/job-queue
 */
import "server-only";

import {
  AIProviderError,
  ConfigurationError,
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { videoManager } from "@/lib/ai/video-manager";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { createVideoStorageService } from "./storage";
import { createVideoUsageService } from "./usage";
import type { VideoGeneration, VideoJob } from "./types";

/** Input accepted by `enqueueRunJob`. */
export interface RunJobInput {
  /** The persisted `video_jobs` row id. */
  jobId: string;
  generationId: string;
  workspaceId: string;
  userId: string;
  provider: string;
  model: string;
  prompt: string;
  type: "text-to-video" | "image-to-video" | "video-to-video";
  sourceImageUrl?: string | null;
  sourceVideoUrl?: string | null;
  duration?: number | null;
  fps?: number | null;
  resolution?: string | null;
  aspectRatio?: string | null;
}

export class VideoJobQueue {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Defer the provider call to the next tick so the API route can
   * respond with the persisted generation row immediately. Errors are
   * logged and propagated into the `video_jobs.error` + `video_generations.error`
   * columns so the UI surfaces them on the next poll.
   */
  enqueueRunJob(input: RunJobInput): void {
    setImmediate(() => {
      void this.runJob(input).catch((err) => {
        logger.error("video job queue unhandled error", {
          jobId: input.jobId,
          generationId: input.generationId,
          error: String(err),
        });
      });
    });
  }

  /**
   * Run a single job. Marks the job `processing`, calls the provider,
   * and either:
   *   - records the final URL on `video_jobs.result_url` + marks both
   *     rows `completed`, OR
   *   - records the `external_job_id` on the job row and leaves it
   *     `processing` so subsequent `pollJob` calls can resolve it.
   */
  async runJob(input: RunJobInput): Promise<void> {
    const log = logger.child({
      jobId: input.jobId,
      generationId: input.generationId,
      provider: input.provider,
    });

    await this.markJob(input.jobId, {
      status: "processing",
      started_at: new Date().toISOString(),
    });
    await this.markGeneration(input.generationId, { status: "processing" });

    try {
      const result = await videoManager.generate(
        // The provider id is validated by the registry; cast through
        // unknown to satisfy the union type after the runtime check.
        input.provider as never,
        {
          model: input.model,
          prompt: input.prompt,
          type: input.type,
          sourceImageUrl: input.sourceImageUrl ?? undefined,
          sourceVideoUrl: input.sourceVideoUrl ?? undefined,
          duration: input.duration ?? undefined,
          fps: input.fps ?? undefined,
          resolution: input.resolution ?? undefined,
          aspectRatio: input.aspectRatio ?? undefined,
        },
      );

      if (result.status === "completed" && result.resultUrl) {
        // Sync provider — materialize the URL into our storage so it
        // survives the provider's TTL (most providers expire their
        // result URLs after 24h).
        const finalUrl = await this.persistResultUrl(
          input.userId,
          result.resultUrl,
          input.generationId,
        ).catch((err) => {
          log.warn("failed to persist result URL; using provider URL directly", {
            error: String(err),
          });
          return result.resultUrl;
        });

        await this.markJob(input.jobId, {
          status: "completed",
          progress: 100,
          result_url: finalUrl,
          completed_at: new Date().toISOString(),
        });
        await this.markGeneration(input.generationId, {
          status: "completed",
          result_url: finalUrl,
          result_storage_path: null,
        });

        await createVideoUsageService().recordGeneration({
          workspaceId: input.workspaceId,
          userId: input.userId,
          provider: input.provider,
          creditsConsumed: 0,
        });
        return;
      }

      if (result.externalJobId) {
        await this.markJob(input.jobId, {
          status: "processing",
          external_job_id: result.externalJobId,
          progress: result.progress ?? 0,
        });
        return;
      }

      // Provider returned neither a result URL nor an external job id —
      // treat as a failure with a clear message.
      throw new AIProviderError(
        `Video provider "${input.provider}" returned an incomplete response.`,
        { provider: input.provider, result },
      );
    } catch (err) {
      const message =
        err instanceof ConfigurationError
          ? err.message
          : err instanceof AIProviderError
            ? err.message
            : "Video generation failed unexpectedly.";
      await this.markJob(input.jobId, {
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      });
      await this.markGeneration(input.generationId, {
        status: "failed",
        error: message,
      });
      log.error("video job failed", { error: message });
    }
  }

  /**
   * Poll the provider for the latest status of a job. The route handler
   * calls this each time the client polls so the DB row stays fresh
   * without a separate cron. Returns the updated `video_jobs` row.
   */
  async pollJob(
    userId: string,
    jobId: string,
  ): Promise<VideoJob & { generation: VideoGeneration | null }> {
    let job: VideoJob | null;
    try {
      const { data, error } = await this.supabase
        .from("video_jobs")
        .select()
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "video_jobs.pollJob select failed");
      job = (data as VideoJob | null) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading video job.", {
        jobId,
        cause: appErr.message,
      });
    }
    if (!job) throw new NotFoundError("VideoJob", jobId);

    // Resolve the owning generation for ownership check + return shape.
    let generation: VideoGeneration | null = null;
    try {
      const { data: genData, error: genError } = await this.supabase
        .from("video_generations")
        .select()
        .eq("id", job.generation_id)
        .maybeSingle();
      if (genError) throw this.toDbError(genError, "video_jobs.pollJob.gen failed");
      generation = (genData as VideoGeneration | null) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading video generation.", {
        generationId: job.generation_id,
        cause: appErr.message,
      });
    }
    if (!generation || generation.user_id !== userId) {
      throw new NotFoundError("VideoJob", jobId);
    }

    // Terminal states have nothing to poll.
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return { ...job, generation };
    }
    if (!job.external_job_id) {
      // Still in the enqueue phase — nothing to poll yet.
      return { ...job, generation };
    }

    try {
      const polled = await videoManager.getJobStatus(
        // Cast through unknown — the provider id was validated when the
        // row was created.
        job.provider as never,
        job.external_job_id,
      );

      if (polled.status === "completed" && polled.resultUrl) {
        const finalUrl = await this.persistResultUrl(
          userId,
          polled.resultUrl,
          generation.id,
        ).catch(() => polled.resultUrl ?? null);

        await this.markJob(job.id, {
          status: "completed",
          progress: polled.progress ?? 100,
          result_url: finalUrl,
          completed_at: new Date().toISOString(),
        });
        await this.markGeneration(generation.id, {
          status: "completed",
          result_url: finalUrl,
        });
        await createVideoUsageService().recordGeneration({
          workspaceId: generation.workspace_id,
          userId,
          provider: job.provider,
          creditsConsumed: generation.credits_consumed ?? 0,
        });
        return { ...job, status: "completed", progress: polled.progress ?? 100, result_url: finalUrl, completed_at: new Date().toISOString(), generation };
      }

      if (polled.status === "failed") {
        const message = polled.error ?? "Provider reported failure.";
        await this.markJob(job.id, {
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        });
        await this.markGeneration(generation.id, {
          status: "failed",
          error: message,
        });
        return { ...job, status: "failed", error: message, generation };
      }

      // Still processing — record the latest progress.
      if (typeof polled.progress === "number") {
        await this.markJob(job.id, { progress: polled.progress });
      }
      return { ...job, progress: polled.progress ?? job.progress, generation };
    } catch (err) {
      const message =
        err instanceof AIProviderError
          ? err.message
          : "Failed to poll provider for job status.";
      logger.warn("video job poll failed", {
        jobId,
        provider: job.provider,
        error: String(err),
      });
      // Don't fail the job — the provider might be transiently unavailable.
      // Return the existing row so the client can keep polling.
      void message;
      return { ...job, generation };
    }
  }

  /**
   * Mark a job as cancelled. The provider is NOT notified — the next
   * poll will simply not happen (the route handler short-circuits on
   * terminal status). A future improvement can call the provider's
   * cancel endpoint when one exists.
   */
  async cancelJob(userId: string, jobId: string): Promise<VideoJob & { generation: VideoGeneration | null }> {
    let job: VideoJob | null;
    try {
      const { data, error } = await this.supabase
        .from("video_jobs")
        .select()
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "video_jobs.cancel select failed");
      job = (data as VideoJob | null) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading video job.", {
        jobId,
        cause: appErr.message,
      });
    }
    if (!job) throw new NotFoundError("VideoJob", jobId);

    let generation: VideoGeneration | null = null;
    try {
      const { data: genData, error: genError } = await this.supabase
        .from("video_generations")
        .select()
        .eq("id", job.generation_id)
        .maybeSingle();
      if (genError) throw this.toDbError(genError, "video_jobs.cancel.gen failed");
      generation = (genData as VideoGeneration | null) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading video generation.", {
        generationId: job.generation_id,
        cause: appErr.message,
      });
    }
    if (!generation || generation.user_id !== userId) {
      throw new NotFoundError("VideoJob", jobId);
    }

    await this.markJob(job.id, {
      status: "cancelled",
      completed_at: new Date().toISOString(),
    });
    await this.markGeneration(generation.id, { status: "cancelled" });
    return { ...job, status: "cancelled", generation };
  }

  /**
   * Retry a failed/cancelled job by enqueuing it again with a fresh
   * `video_jobs` row. Returns the new job.
   */
  async retryJob(
    userId: string,
    jobId: string,
  ): Promise<VideoJob & { generation: VideoGeneration | null }> {
    const polled = await this.pollJob(userId, jobId);
    const { generation } = polled;
    if (!generation) throw new NotFoundError("VideoJob", jobId);

    // Insert a new job row pointing at the same generation, then enqueue.
    const newJobRow = {
      workspace_id: polled.workspace_id,
      generation_id: generation.id,
      provider: generation.provider,
      external_job_id: null,
      status: "pending" as const,
      progress: 0,
      result_url: null,
      error: null,
    };
    let newJob: VideoJob;
    try {
      const { data, error } = await this.supabase
        .from("video_jobs")
        .insert(newJobRow as never)
        .select()
        .single();
      if (error) throw this.toDbError(error, "video_jobs.retry insert failed");
      newJob = data as VideoJob;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating retry job.", {
        jobId,
        cause: appErr.message,
      });
    }

    // Reset the generation status so the UI shows it in flight.
    await this.markGeneration(generation.id, { status: "pending", error: null });

    this.enqueueRunJob({
      jobId: newJob.id,
      generationId: generation.id,
      workspaceId: polled.workspace_id,
      userId,
      provider: generation.provider,
      model: generation.model,
      prompt: generation.prompt,
      type: generation.type,
      sourceImageUrl: generation.source_image_url,
      sourceVideoUrl: generation.source_video_url,
      duration: generation.duration,
      fps: generation.fps,
      resolution: generation.resolution,
      aspectRatio: generation.aspect_ratio,
    });

    return { ...newJob, generation };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Fetch a video file from a URL and persist it to the `ai-assets` bucket. */
  private async persistResultUrl(
    userId: string,
    resultUrl: string,
    generationId: string,
  ): Promise<string | null> {
    try {
      const res = await fetch(resultUrl);
      if (!res.ok) {
        throw new AIProviderError(
          `Failed to download provider result (HTTP ${res.status}).`,
          { url: resultUrl, status: res.status },
        );
      }
      const blob = await res.blob();
      const contentType = blob.type || "video/mp4";
      const ext = contentType.includes("webm")
        ? "webm"
        : contentType.includes("ogg")
          ? "ogv"
          : "mp4";
      const fileName = `generation-${generationId}.${ext}`;
      const storage = await createVideoStorageService();
      const uploaded = await storage.uploadResult(
        userId,
        blob,
        fileName,
        contentType,
      );
      // Best-effort: return the storage path-derived signed URL so the
      // UI can play it back; falls back to the provider's direct URL.
      try {
        return await storage.getSignedUrl(uploaded.path, 3600);
      } catch {
        return resultUrl;
      }
    } catch (err) {
      logger.warn("video result download/persist failed; using provider URL", {
        userId,
        generationId,
        error: String(err),
      });
      return resultUrl;
    }
  }

  private async markJob(jobId: string, patch: Partial<VideoJob>): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("video_jobs")
        .update(patch as never)
        .eq("id", jobId);
      if (error) throw this.toDbError(error, "video_jobs.update failed");
    } catch (err) {
      logger.warn("video_jobs.update failed", {
        jobId,
        patch,
        error: String(err),
      });
    }
  }

  private async markGeneration(
    generationId: string,
    patch: Partial<VideoGeneration>,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("video_generations")
        .update(patch as never)
        .eq("id", generationId);
      if (error) throw this.toDbError(error, "video_generations.update failed");
    } catch (err) {
      logger.warn("video_generations.update failed", {
        generationId,
        patch,
        error: String(err),
      });
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

/** Build the canonical {@link VideoJobQueue}. */
export function createVideoJobQueue(): VideoJobQueue {
  return new VideoJobQueue(createSupabaseAdminClient());
}
