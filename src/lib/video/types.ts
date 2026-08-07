/**
 * Supa AI — Phase 5 AI Video — types.
 *
 * Domain-level types shared by the video service layer, API routes, and
 * the client UI. These are intentionally plain TS types (no Zod, no
 * `server-only`) so the file is safe to import from client components
 * via the {@link "@/lib/video/client"} barrel.
 *
 * The DB-level row shapes live in `@/lib/supabase/types`
 * (`Tables<'video_*'>`). The types here are the *service* shape —
 * narrower column sets, friendly camelCase field names, and
 * discriminated unions for status enums.
 *
 * @module @/lib/video/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";
import type {
  VideoGenerationType,
  VideoProviderId,
  VideoStatus,
} from "@/lib/ai/video-types";

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

/** Full row of `video_generations`. */
export type VideoGeneration = Tables<"video_generations">;
/** Full row of `video_models`. */
export type VideoModelRow = Tables<"video_models">;
/** Full row of `video_uploads`. */
export type VideoUpload = Tables<"video_uploads">;
/** Full row of `video_jobs`. */
export type VideoJob = Tables<"video_jobs">;
/** Full row of `video_usage`. */
export type VideoUsage = Tables<"video_usage">;

/** Insert shape for `video_generations` (used by the service). */
export type VideoGenerationInsert = TablesInsert<"video_generations">;
/** Update shape for `video_generations`. */
export type VideoGenerationUpdate = TablesUpdate<"video_generations">;
/** Insert shape for `video_jobs`. */
export type VideoJobInsert = TablesInsert<"video_jobs">;
/** Update shape for `video_jobs`. */
export type VideoJobUpdate = TablesUpdate<"video_jobs">;
/** Insert shape for `video_uploads`. */
export type VideoUploadInsert = TablesInsert<"video_uploads">;
/** Insert shape for `video_usage`. */
export type VideoUsageInsert = TablesInsert<"video_usage">;
/** Update shape for `video_usage`. */
export type VideoUsageUpdate = TablesUpdate<"video_usage">;

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  VideoGenerationType,
  VideoProviderId,
  VideoStatus,
} from "@/lib/ai/video-types";

// ---------------------------------------------------------------------------
// Service-level DTOs
// ---------------------------------------------------------------------------

/** Input accepted by `VideoService.generate`. */
export interface GenerateVideoRequest {
  provider: VideoProviderId;
  model: string;
  prompt: string;
  type?: VideoGenerationType;
  sourceImageUrl?: string | null;
  sourceVideoUrl?: string | null;
  duration?: number;
  fps?: number;
  resolution?: string;
  aspectRatio?: string;
}

/** Options accepted by `VideoService.list`. */
export interface ListVideoOptions {
  status?: VideoStatus;
  provider?: VideoProviderId;
  type?: VideoGenerationType;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Result of `VideoService.getUsageSummary` (current month). */
export interface VideoUsageSummary {
  videosGenerated: number;
  creditsUsed: number;
  byProvider: Record<string, { count: number; credits: number }>;
  period: { start: string; end: string };
}

/** Composite job + generation row returned by the jobs endpoint. */
export interface VideoJobWithGeneration {
  job: VideoJob;
  generation: VideoGeneration | null;
}
