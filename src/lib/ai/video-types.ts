/**
 * Supa AI — AI video provider abstraction types.
 *
 * Provider-agnostic shapes for video generation. Every concrete provider
 * implementation maps its native SDK / HTTP API to these types so call
 * sites never branch on provider.
 *
 * @module @/lib/ai/video-types
 */

/**
 * Provider identifiers supported by the video platform. Mirrors the
 * `videoProviderSchema` in `@/lib/validation/video` and the
 * `video_models` rows seeded in `0007_phase5_video.sql`.
 */
export type VideoProviderId =
  | "runway"
  | "kling"
  | "luma"
  | "pika"
  | "replicate"
  | "fal"
  | "google"
  | "openai";

/** Generation type — see the `video_generations.type` CHECK constraint. */
export type VideoGenerationType =
  | "text-to-video"
  | "image-to-video"
  | "video-to-video";

/** Lifecycle status of a video generation row + job row. */
export type VideoStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

/** Aspect ratios most providers accept (kept loose — providers may extend). */
export type VideoAspectRatio =
  | "16:9"
  | "9:16"
  | "1:1"
  | "4:3"
  | "3:4"
  | "21:9";

/**
 * Request body passed to a provider's `generate()` method. The service
 * layer assembles this from the validated API input + the persisted
 * `video_generations` row.
 */
export interface VideoGenerateRequest {
  /** Provider-specific model id (e.g. `gen-3-alpha`). */
  model: string;
  /** The text prompt driving the generation. Required for all types. */
  prompt: string;
  /** Discriminates the generation flow. */
  type: VideoGenerationType;
  /**
   * Source image URL for `image-to-video`. Required when `type ===
   * 'image-to-video'`. Must be a publicly reachable URL — providers
   * fetch it server-side.
   */
  sourceImageUrl?: string | null;
  /**
   * Source video URL for `video-to-video`. Required when `type ===
   * 'video-to-video'`. Must be a publicly reachable URL.
   */
  sourceVideoUrl?: string | null;
  /** Requested duration in seconds (1..60 — provider may clamp). */
  duration?: number;
  /** Requested frames per second (provider-dependent). */
  fps?: number;
  /** Resolution label (e.g. `720p`, `1080p`). */
  resolution?: string;
  /** Aspect ratio label (e.g. `16:9`). */
  aspectRatio?: string;
  /** Optional provider-specific extension bag (negative prompt, seed…). */
  options?: Record<string, unknown>;
}

/**
 * Result of a `generate()` call. Providers return either:
 *   - `status === 'completed'` with `resultUrl` — the provider generated
 *     the video synchronously (rare; most video APIs are async).
 *   - `status === 'processing'` with `externalJobId` — the provider
 *     accepted the request and is processing it. Polling via
 *     `getJobStatus(externalJobId)` is required to resolve the final
 *     URL + status.
 */
export interface VideoGenerationResult {
  /** Provider-side id for the generation (distinct from our row id). */
  id?: string;
  /** External job id (set when `status === 'processing'`). */
  externalJobId?: string;
  /** Sync providers may already have the URL; async providers leave it null. */
  resultUrl?: string | null;
  /** Final (sync) or intermediate (async) status. */
  status: VideoStatus;
  /** Provider-reported progress (0..100) when known. */
  progress?: number;
  /** Error message on failure (sync providers). */
  error?: string | null;
  /** Provider-echoed model + metadata for the audit trail. */
  raw?: unknown;
}

/** Result of a `getJobStatus()` polling call. */
export interface VideoJobPollResult {
  externalJobId: string;
  status: VideoStatus;
  /** Progress percentage 0..100 (best-effort — some providers omit it). */
  progress?: number;
  /** Resolved video URL when `status === 'completed'`. */
  resultUrl?: string | null;
  /** Error message when `status === 'failed'`. */
  error?: string | null;
  raw?: unknown;
}

/** Catalog entry for a video model offered by a provider. */
export interface VideoModel {
  /** Provider-issued model id (e.g. `gen-3-alpha`). */
  id: string;
  /** Owning provider id. */
  provider: VideoProviderId;
  /** Human-friendly label. */
  label: string;
  /** Marketing / capability description. */
  description?: string;
  /** Max duration (seconds) the provider supports for this model. */
  maxDuration?: number;
  /** Resolutions this model accepts (e.g. `['720p','1080p']`). */
  supportedResolutions?: string[];
  /** Generation types this model accepts. */
  supportedTypes?: VideoGenerationType[];
  /** Default resolution used when the caller doesn't pass one. */
  defaultResolution?: string;
  /** Default aspect ratio used when the caller doesn't pass one. */
  defaultAspectRatio?: VideoAspectRatio;
  /** Estimated cost in USD cents per generation (or per second when known). */
  costCentsPerSecond?: number;
  /** Free-form provider-specific metadata. */
  metadata?: Record<string, unknown>;
}

/** Result of a one-shot `getUploadTarget` call (when providers require their own upload step). */
export interface VideoUploadTarget {
  /** Pre-signed upload URL the client PUTs the source asset to. */
  uploadUrl: string;
  /** HTTP method to use against `uploadUrl` (default `PUT`). */
  method?: "PUT" | "POST";
  /** Headers to attach to the upload request. */
  headers?: Record<string, string>;
  /** Final public URL the caller passes back into `generate({ sourceImageUrl })`. */
  publicUrl?: string;
  /** Provider-issued upload id (for status tracking). */
  uploadId?: string;
}
