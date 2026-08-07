/**
 * Supa AI — Phase 5 AI Video Zod schemas.
 *
 * Reusable validation rules for every Phase 5 video surface: generate
 * request, history list query, and source-video upload metadata. Infer
 * types from these schemas so the runtime contract and the TypeScript
 * type can never drift apart.
 *
 * @module @/lib/validation/video
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Providers + types
// ---------------------------------------------------------------------------

/**
 * AI video provider identifiers supported by the platform. Mirrors the
 * provider id set in `@/lib/ai/video-types` and the seeded `video_models`
 * rows in `0007_phase5_video.sql`.
 */
export const videoProviderSchema = z.enum([
  "runway",
  "kling",
  "luma",
  "pika",
  "replicate",
  "fal",
  "google",
  "openai",
]);

/** Generation type — see the `video_generations.type` CHECK constraint. */
export const videoTypeSchema = z.enum([
  "text-to-video",
  "image-to-video",
  "video-to-video",
]);

/** Status lifecycle — see the `video_generations.status` CHECK constraint. */
export const videoStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

// ---------------------------------------------------------------------------
// Generate payload
// ---------------------------------------------------------------------------

/**
 * Maximum prompt length. Generous — cinematic prompts can be elaborate —
 * but capped to keep cost + storage bounded.
 */
const MAX_PROMPT_LENGTH = 8_000;

const promptSchema = z
  .string()
  .trim()
  .min(1, "Prompt must not be empty.")
  .max(
    MAX_PROMPT_LENGTH,
    `Prompt must be at most ${MAX_PROMPT_LENGTH} characters.`,
  );

const resolutionSchema = z
  .string()
  .trim()
  .max(32, "Resolution must be at most 32 characters.")
  .optional();

const aspectRatioSchema = z
  .string()
  .trim()
  .max(16, "Aspect ratio must be at most 16 characters.")
  .optional();

/**
 * Generate-video payload.
 *
 * `type === 'image-to-video'` requires `sourceImageUrl` (the image the
 * video motion will be driven from). `type === 'video-to-video'` requires
 * `sourceVideoUrl` (the source video for re-styling / extension).
 */
export const generateVideoSchema = z
  .object({
    provider: videoProviderSchema,
    model: z
      .string()
      .trim()
      .min(1, "Model must not be empty.")
      .max(128, "Model must be at most 128 characters."),
    prompt: promptSchema,
    type: videoTypeSchema.default("text-to-video"),
    sourceImageUrl: z
      .string()
      .trim()
      .url("Source image URL must be a valid URL.")
      .optional()
      .nullable(),
    sourceVideoUrl: z
      .string()
      .trim()
      .url("Source video URL must be a valid URL.")
      .optional()
      .nullable(),
    duration: z
      .number()
      .int("Duration must be an integer (seconds).")
      .min(1, "Duration must be at least 1 second.")
      .max(60, "Duration must be at most 60 seconds.")
      .optional(),
    fps: z
      .number()
      .int("FPS must be an integer.")
      .min(1, "FPS must be at least 1.")
      .max(120, "FPS must be at most 120.")
      .optional(),
    resolution: resolutionSchema,
    aspectRatio: aspectRatioSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      val.type === "image-to-video" &&
      (val.sourceImageUrl === undefined || val.sourceImageUrl === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceImageUrl"],
        message: "Image-to-video generation requires a source image URL.",
      });
    }
    if (
      val.type === "video-to-video" &&
      (val.sourceVideoUrl === undefined || val.sourceVideoUrl === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceVideoUrl"],
        message: "Video-to-video generation requires a source video URL.",
      });
    }
  });

// ---------------------------------------------------------------------------
// History list query
// ---------------------------------------------------------------------------

/** Status filter for the history list endpoint. */
export const listVideoQuerySchema = z.object({
  status: videoStatusSchema.optional(),
  provider: videoProviderSchema.optional(),
  type: videoTypeSchema.optional(),
  search: z
    .string()
    .trim()
    .max(500, "Search query must be at most 500 characters.")
    .optional(),
  limit: z.coerce
    .number()
    .int("Limit must be an integer.")
    .min(1, "Limit must be at least 1.")
    .max(100, "Limit must be at most 100.")
    .optional(),
  offset: z.coerce
    .number()
    .int("Offset must be an integer.")
    .min(0, "Offset must be at least 0.")
    .optional(),
});

// ---------------------------------------------------------------------------
// Upload metadata
// ---------------------------------------------------------------------------

/**
 * Source-video upload payload. Used by the POST `/api/video/upload`
 * endpoint to validate metadata *after* the multipart form data has been
 * parsed. The file body itself is validated separately by the storage
 * layer (MIME + size against the `ai-assets` bucket allowlist).
 */
export const uploadVideoSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "File name must not be empty.")
    .max(255, "File name must be at most 255 characters."),
  fileSize: z
    .number()
    .int("File size must be an integer (bytes).")
    .min(1, "File size must be greater than zero.")
    .max(100 * 1024 * 1024, "File size must be at most 100 MB."),
  mimeType: z
    .string()
    .trim()
    .min(1, "MIME type must not be empty.")
    .max(128, "MIME type must be at most 128 characters."),
  duration: z
    .number()
    .min(0, "Duration must be at least 0 seconds.")
    .max(600, "Duration must be at most 600 seconds (10 minutes).")
    .optional(),
  width: z
    .number()
    .int("Width must be an integer.")
    .min(1, "Width must be at least 1.")
    .max(8192, "Width must be at most 8192.")
    .optional(),
  height: z
    .number()
    .int("Height must be an integer.")
    .min(1, "Height must be at least 1.")
    .max(8192, "Height must be at most 8192.")
    .optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type VideoProvider = z.infer<typeof videoProviderSchema>;
export type VideoType = z.infer<typeof videoTypeSchema>;
export type VideoStatus = z.infer<typeof videoStatusSchema>;
export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;
export type ListVideoQuery = z.infer<typeof listVideoQuerySchema>;
export type UploadVideoInput = z.infer<typeof uploadVideoSchema>;
