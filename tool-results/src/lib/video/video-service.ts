/**
 * Supa AI — Phase 5 AI Video — VideoService (server-only).
 *
 * The single, canonical write-path for the AI Video domain. Owns every
 * `video_generations` + `video_jobs` operation: create (with the
 * background job enqueued), fetch, list, delete, and source-video
 * upload. Built on the **admin** Supabase client (Phase 5 has no
 * per-row `is_workspace_member` trigger yet; the admin client bypasses
 * RLS so writes from the service succeed). Every mutation still
 * filters on `user_id` at the query layer so the surface is defense-
 * in-depth even after a future Phase wires up true workspace-scoped RLS.
 *
 * ## Generation flow
 *
 *   1. `generate()` validates the request, computes a credit cost from
 *      the catalog row's `costCentsPerSecond` × requested duration,
 *      persists a `video_generations` row with `status='pending'`,
 *      persists a `video_jobs` row, and calls
 *      {@link VideoJobQueue.enqueueRunJob} so the actual provider call
 *      runs on the next Node event-loop tick.
 *   2. The API route returns the persisted generation row immediately
 *      so the UI can show it in the gallery with a `processing` status.
 *   3. The UI polls `/api/video/jobs/[id]` until the job reaches a
 *      terminal state (`completed`, `failed`, `cancelled`).
 *
 * ## Credit policy
 *
 * Phase 5 V1 records credits consumed but does NOT deduct from
 * `profiles.credits_balance` — the deduction is wired in Phase 6 when
 * the billing integration ships. The `credits_consumed` column on
 * `video_generations` is populated so the usage rollup is honest about
 * the would-be cost.
 *
 * @module @/lib/video/video-service
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
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { videoManager } from "@/lib/ai/video-manager";

import { createVideoJobQueue, type RunJobInput } from "./job-queue";
import { createVideoUploadService, type VideoUploadService } from "./upload";
import { createVideoStorageService } from "./storage";
import type {
  GenerateVideoRequest,
  ListVideoOptions,
  VideoGeneration,
  VideoJob,
  VideoUpload,
} from "./types";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

/**
 * Default per-second cost (USD cents) when a catalog row doesn't carry
 * one. Conservative — covers Phase 5 V1 even before the catalog is
 * fully populated.
 */
const DEFAULT_COST_CENTS_PER_SECOND = 5;

export class VideoService {
  constructor(
    private readonly supabase: AdminSupabaseClient,
    /** Server (RLS-enforced) client for reads that should respect RLS. */
    private readonly reader: AnySupabaseClient,
    private readonly uploadService: VideoUploadService,
  ) {}

  // -----------------------------------------------------------------------
  // Generate
  // -----------------------------------------------------------------------

  /**
   * Create a new video generation. Steps:
   *   1. Resolve the catalog row to validate `provider` + `model` and
   *      compute the credit cost.
   *   2. Insert a `video_generations` row with `status='pending'`.
   *   3. Insert a `video_jobs` row pointing at it.
   *   4. Enqueue the run via {@link VideoJobQueue.enqueueRunJob}.
   *
   * Returns the persisted `video_generations` row. The caller (API
   * route) responds with this row immediately; the deferred job queue
   * mutates it as the provider reports progress.
   */
  async generate(
    workspaceId: string,
    userId: string,
    input: GenerateVideoRequest,
  ): Promise<VideoGeneration> {
    if (!input.prompt?.trim()) {
      throw new ValidationError("Prompt must not be empty.");
    }
    if (
      input.type === "image-to-video" &&
      !input.sourceImageUrl
    ) {
      throw new ValidationError(
        "Image-to-video generation requires a source image URL.",
      );
    }
    if (input.type === "video-to-video" && !input.sourceVideoUrl) {
      throw new ValidationError(
        "Video-to-video generation requires a source video URL.",
      );
    }

    // Compute the credit cost (best-effort — when the provider's
    // catalog doesn't expose `costCentsPerSecond`, fall back to the
    // default). Phase 5 V1 records the cost but does NOT deduct.
    const creditsConsumed = await this.computeCostCents(
      input.provider,
      input.model,
      input.duration ?? 5,
    );

    const type =
      input.type ?? (input.sourceImageUrl ? "image-to-video" : "text-to-video");

    const row = {
      workspace_id: workspaceId,
      user_id: userId,
      provider: input.provider,
      model: input.model,
      prompt: input.prompt.trim(),
      type,
      source_image_url: input.sourceImageUrl ?? null,
      source_video_url: input.sourceVideoUrl ?? null,
      duration: input.duration ?? null,
      fps: input.fps ?? null,
      resolution: input.resolution ?? null,
      aspect_ratio: input.aspectRatio ?? null,
      status: "pending" as const,
      credits_consumed: creditsConsumed,
      metadata: null,
    };

    let generation: VideoGeneration;
    try {
      const { data, error } = await this.supabase
        .from("video_generations")
        .insert(row as never)
        .select()
        .single();
      if (error) throw this.toDbError(error, "video_generations.insert failed");
      if (!data) {
        throw new DatabaseError("video_generations.insert returned no row.");
      }
      generation = data as VideoGeneration;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating video generation.", {
        userId,
        cause: appErr.message,
      });
    }

    // Insert the job row and enqueue the background run.
    let job: VideoJob;
    try {
      const { data, error } = await this.supabase
        .from("video_jobs")
        .insert({
          workspace_id: workspaceId,
          generation_id: generation.id,
          provider: input.provider,
          external_job_id: null,
          status: "pending",
          progress: 0,
          result_url: null,
          error: null,
        } as never)
        .select()
        .single();
      if (error) throw this.toDbError(error, "video_jobs.insert failed");
      job = data as VideoJob;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating video job.", {
        generationId: generation.id,
        cause: appErr.message,
      });
    }

    const runInput: RunJobInput = {
      jobId: job.id,
      generationId: generation.id,
      workspaceId,
      userId,
      provider: input.provider,
      model: input.model,
      prompt: generation.prompt,
      type: generation.type,
      sourceImageUrl: generation.source_image_url,
      sourceVideoUrl: generation.source_video_url,
      duration: generation.duration,
      fps: generation.fps,
      resolution: generation.resolution,
      aspectRatio: generation.aspect_ratio,
    };
    createVideoJobQueue().enqueueRunJob(runInput);

    logger.info("video generation enqueued", {
      generationId: generation.id,
      jobId: job.id,
      provider: input.provider,
      model: input.model,
      type: generation.type,
      userId,
    });

    return generation;
  }

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  /**
   * Fetch a single generation. Uses the RLS-enforced server client so
   * ownership is enforced at the policy layer (defense-in-depth: the
   * `eq('user_id')` filter is applied too).
   */
  async getById(userId: string, generationId: string): Promise<VideoGeneration | null> {
    try {
      const { data, error } = await this.reader
        .from("video_generations")
        .select()
        .eq("id", generationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "video_generations.get failed");
      return (data as VideoGeneration | null) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading video generation.", {
        userId,
        generationId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Paginated list of the caller's generations, newest first. Filters
   * by status / provider / type / search (ILIKE on prompt).
   */
  async list(
    userId: string,
    opts: ListVideoOptions = {},
  ): Promise<VideoGeneration[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      let query = this.reader
        .from("video_generations")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.provider) query = query.eq("provider", opts.provider);
      if (opts.type) query = query.eq("type", opts.type);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.ilike("prompt", `%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw this.toDbError(error, "video_generations.list failed");
      return (data ?? []) as VideoGeneration[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing video generations.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Hard-delete a generation. Cascades to its `video_jobs` rows via the
   * FK declared in `0007`. The persisted result storage object (if any)
   * is best-effort deleted.
   */
  async delete(userId: string, generationId: string): Promise<void> {
    const row = await this.getById(userId, generationId);
    if (!row) throw new NotFoundError("VideoGeneration", generationId);

    try {
      const { error } = await this.supabase
        .from("video_generations")
        .delete()
        .eq("id", generationId)
        .eq("user_id", userId);
      if (error) throw this.toDbError(error, "video_generations.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting video generation.", {
        userId,
        generationId,
        cause: appErr.message,
      });
    }

    // Best-effort storage cleanup of any persisted result object.
    if (row.result_storage_path) {
      try {
        const storage = await createVideoStorageService();
        await storage.delete(row.result_storage_path);
      } catch {
        // Swallow — logged inside storage layer.
      }
    }
  }

  // -----------------------------------------------------------------------
  // Upload delegation
  // -----------------------------------------------------------------------

  /** Upload a source video. Delegates to {@link VideoUploadService}. */
  async upload(
    workspaceId: string,
    userId: string,
    file: File,
    metadata: { duration?: number; width?: number; height?: number } = {},
  ): Promise<VideoUpload> {
    return this.uploadService.upload(workspaceId, userId, file, metadata);
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Compute the credit cost in USD cents for a generation. Looks up the
   * provider's static catalog (via {@link videoManager.listModels}) and
   * uses `costCentsPerSecond` × `duration` when available; otherwise
   * falls back to {@link DEFAULT_COST_CENTS_PER_SECOND} × `duration`.
   */
  private async computeCostCents(
    provider: string,
    model: string,
    durationSec: number,
  ): Promise<number> {
    try {
      const models = await videoManager.listModels(provider as never).catch(() => []);
      const match = models.find((m) => m.id === model);
      const ratePerSec = match?.costCentsPerSecond ?? DEFAULT_COST_CENTS_PER_SECOND;
      return Math.max(1, Math.round(ratePerSec * Math.max(1, durationSec)));
    } catch {
      return Math.max(1, Math.round(DEFAULT_COST_CENTS_PER_SECOND * Math.max(1, durationSec)));
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

/**
 * Build the canonical {@link VideoService} for use in API routes.
 * Uses the admin client for writes (the 0007 RLS allows the caller to
 * insert their own rows, but writes from the service should not depend
 * on the anon-key RLS path — defense-in-depth) and the server client
 * for reads (so ownership is enforced via RLS).
 */
export async function createVideoService(): Promise<VideoService> {
  const admin = createSupabaseAdminClient();
  const reader = await createSupabaseServerClient();
  const uploadService = await createVideoUploadService();
  return new VideoService(admin, reader, uploadService);
}

/**
 * Build an admin-only {@link VideoService} (no reader). Use sparingly —
 * only for back-office paths where the caller is a system actor and
 * not the row owner.
 */
export async function createVideoServiceAdmin(): Promise<VideoService> {
  const admin = createSupabaseAdminClient();
  const uploadService = await createVideoUploadService();
  return new VideoService(admin, admin, uploadService);
}
