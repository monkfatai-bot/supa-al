/**
 * Supa AI — Phase 4 AI Images — client-safe types.
 *
 * Domain-level types shared by the image service layer, API routes,
 * and the client UI. These are intentionally plain TS types (no Zod, no
 * `server-only`) so the file is safe to import from client components
 * via the {@link "@/lib/image/client"} barrel.
 *
 * The DB-level row shapes live in `@/lib/supabase/types`
 * (`Tables<'image_*'>`). The types here are the *service* shape —
 * narrower column sets, friendly camelCase field names, and
 * discriminated unions for status enums.
 *
 * @module @/lib/image/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";
import type { ImageProviderId, ImageQuality } from "@/lib/ai/image-types";

// ---------------------------------------------------------------------------
// Status enums (mirrors the CHECK constraints in 0006_phase4_images.sql)
// ---------------------------------------------------------------------------

/** Lifecycle status of an `image_generations` row. */
export type ImageGenerationStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

/** Full row of `image_generations`. */
export type ImageGeneration = Tables<"image_generations">;
/** Full row of `image_models`. */
export type ImageModelRow = Tables<"image_models">;
/** Full row of `image_styles`. */
export type ImageStyle = Tables<"image_styles">;
/** Full row of `image_uploads`. */
export type ImageUpload = Tables<"image_uploads">;
/** Full row of `image_usage`. */
export type ImageUsage = Tables<"image_usage">;

// ---------------------------------------------------------------------------
// Service-layer input shapes (camelCase, used by the service + UI).
// ---------------------------------------------------------------------------

/** Input for `ImageService.generate`. */
export interface GenerateImageInput {
  provider: ImageProviderId;
  model: string;
  prompt: string;
  negativePrompt?: string;
  style?: string;
  size?: string;
  quality?: ImageQuality;
  n?: number;
  seed?: number;
  /** Optional workspace id (Phase 9A). Defaults to the caller's user id. */
  workspaceId?: string;
}

/** Filters accepted by `ImageService.list`. */
export interface ListImagesQuery {
  status?: ImageGenerationStatus;
  provider?: ImageProviderId;
  model?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Filters accepted by `ImageService.getUsageStats`. */
export interface ImageUsageQuery {
  /** ISO date for the inclusive lower bound. */
  from?: string;
  /** ISO date for the exclusive upper bound. */
  to?: string;
}

/** Result of `ImageService.getUsageStats`. */
export interface ImageUsageStats {
  totalImages: number;
  totalCredits: number;
  byProvider: Record<string, { images: number; credits: number }>;
  period: { start: string; end: string };
}

/** Input for `ImageService.upload`. */
export interface UploadImageInput {
  fileName: string;
  /** The raw bytes of the file. */
  body: Blob | ArrayBuffer | ArrayBufferView;
  mimeType: string;
  width?: number;
  height?: number;
  /** Optional workspace id (Phase 9A). */
  workspaceId?: string;
}

/** Result of `ImageService.upload`. */
export interface UploadImageResult {
  upload: ImageUpload;
  /** A signed URL the client can use to display the image (short-lived). */
  signedUrl: string;
}

/** Input for image-edit operations (enhance / upscale / remove-bg). */
export interface EditImageInput {
  /** The image-generation id whose result should be edited. */
  generationId: string;
  /** The edit operation to apply. */
  operation: "enhance" | "upscale" | "remove-background";
  /** Optional revised prompt (used by `enhance`). */
  prompt?: string;
  /** Optional scale factor (used by `upscale`, defaults to 2). */
  scale?: number;
}

/** Result of an edit operation. */
export interface EditImageResult {
  generation: ImageGeneration;
}

/** Row-insert shape re-export (used by the image service). */
export type ImageGenerationInsert = TablesInsert<"image_generations">;
export type ImageGenerationUpdate = TablesUpdate<"image_generations">;
export type ImageUploadInsert = TablesInsert<"image_uploads">;
export type ImageUsageInsert = TablesInsert<"image_usage">;
