/**
 * Supa AI — Phase 4 AI Images Zod schemas.
 *
 * Reusable validation rules for every Phase 4 image surface: generate,
 * list-history, upload, and the image-edit operations. Infer types
 * from these schemas so the runtime contract and the TypeScript type
 * can never drift apart.
 *
 * @module @/lib/validation/image
 */
import { z } from "zod";

import { uuidSchema } from "./common";

// ---------------------------------------------------------------------------
// Providers + models
// ---------------------------------------------------------------------------

/**
 * Image provider identifiers supported by the platform. Mirrors
 * `ImageProviderId` in `@/lib/ai/image-types` so the schema is the single
 * source of truth for runtime validation.
 */
export const imageProviderSchema = z.enum([
  "openai",
  "stability",
  "replicate",
  "fal",
  "ideogram",
  "google",
]);

/**
 * Image quality presets. Provider-dependent; the service maps the
 * normalized values to provider-specific tokens.
 */
export const imageQualitySchema = z.enum(["low", "standard", "high", "hd"]);

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

/**
 * Maximum prompt length. 4K matches the OpenAI / Ideogram ceilings and
 * keeps the request payload bounded.
 */
export const MAX_IMAGE_PROMPT_LENGTH = 4_000;

const imagePromptSchema = z
  .string()
  .trim()
  .min(1, "Prompt must not be empty.")
  .max(
    MAX_IMAGE_PROMPT_LENGTH,
    `Prompt must be at most ${MAX_IMAGE_PROMPT_LENGTH} characters.`,
  );

/**
 * Generate-image payload. `provider` + `model` + `prompt` are required;
 * everything else is optional.
 */
export const generateImageSchema = z
  .object({
    provider: imageProviderSchema,
    model: z
      .string()
      .trim()
      .min(1, "Model must not be empty.")
      .max(128, "Model must be at most 128 characters."),
    prompt: imagePromptSchema,
    negativePrompt: z
      .string()
      .trim()
      .max(2_000, "Negative prompt must be at most 2000 characters.")
      .optional(),
    style: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional(),
    size: z
      .string()
      .trim()
      .regex(/^\d{2,5}x\d{2,5}$/, "Size must be WIDTHxHEIGHT (e.g. 1024x1024).")
      .optional(),
    quality: imageQualitySchema.optional(),
    n: z
      .number()
      .int("n must be an integer.")
      .min(1, "n must be at least 1.")
      .max(4, "n must be at most 4.")
      .optional(),
    seed: z
      .number()
      .int("seed must be an integer.")
      .min(0)
      .max(2 ** 31 - 1)
      .optional(),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// List history
// ---------------------------------------------------------------------------

/**
 * List-history query. All fields optional; the service applies sensible
 * defaults when omitted.
 */
export const listImagesQuerySchema = z
  .object({
    status: z
      .enum(["pending", "processing", "succeeded", "failed", "cancelled"])
      .optional(),
    provider: imageProviderSchema.optional(),
    model: z.string().trim().min(1).max(128).optional(),
    search: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/** Allowed upload MIME types for the image editor workflows. */
const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/**
 * Upload-image payload. The API route parses multipart form data + applies
 * this schema to the parsed metadata + the file object.
 */
export const uploadImageSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1, "File name must not be empty.")
      .max(256, "File name must be at most 256 characters."),
    mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES, {
      message: "MIME type must be one of: image/jpeg, image/png, image/webp, image/gif.",
    }),
    fileSize: z
      .number()
      .int()
      .min(1, "File must not be empty.")
      .max(50 * 1024 * 1024, "File size must be at most 50MB."),
    width: z.number().int().min(1).max(10_000).optional(),
    height: z.number().int().min(1).max(10_000).optional(),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Image-edit operations
// ---------------------------------------------------------------------------

/**
 * Edit-image payload. Used by the enhance / upscale / remove-bg routes.
 */
export const editImageSchema = z
  .object({
    generationId: uuidSchema,
    operation: z.enum(["enhance", "upscale", "remove-background"]),
    prompt: z.string().trim().min(1).max(MAX_IMAGE_PROMPT_LENGTH).optional(),
    scale: z.number().int().min(2).max(4).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ImageProvider = z.infer<typeof imageProviderSchema>;
export type ImageQuality = z.infer<typeof imageQualitySchema>;
export type GenerateImageInput = z.infer<typeof generateImageSchema>;
export type ListImagesQuery = z.infer<typeof listImagesQuerySchema>;
export type UploadImageInput = z.infer<typeof uploadImageSchema>;
export type EditImageInput = z.infer<typeof editImageSchema>;
