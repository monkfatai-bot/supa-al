/**
 * Supa AI — AI image provider abstraction types.
 *
 * Provider-agnostic shapes for image generation requests, results, models,
 * and image-edit operations (enhance, upscale, remove-background). Every
 * image provider implementation maps its native SDK to these types so
 * call sites never branch on provider.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-types
 */
import "server-only";

/** Image provider identifiers supported by the platform. */
export type ImageProviderId =
  | "openai"
  | "stability"
  | "replicate"
  | "fal"
  | "ideogram"
  | "google";

/** Image quality presets (provider-agnostic). */
export type ImageQuality = "low" | "standard" | "high" | "hd";

/** Image edit operation type. */
export type ImageEditOperation =
  | "enhance"
  | "upscale"
  | "remove-background";

/** Request to generate an image. */
export interface ImageGenRequest {
  /** Provider-issued model id (e.g. `dall-e-3`). */
  model: string;
  /** Positive prompt (required). */
  prompt: string;
  /** Negative prompt — things to avoid (provider-dependent). */
  negativePrompt?: string;
  /** Preset style key (e.g. `photographic`). */
  style?: string;
  /** Output size (`1024x1024`, `1792x1024`, …). */
  size?: string;
  /** Quality preset. */
  quality?: ImageQuality;
  /** Number of images to generate (provider-dependent, default 1). */
  n?: number;
  /** Seed for reproducibility (provider-dependent). */
  seed?: number;
  /** Source image URL for edit workflows (enhance / upscale / remove-bg). */
  sourceImageUrl?: string;
  /** Edit operation to apply when `sourceImageUrl` is set. */
  operation?: ImageEditOperation;
  /** End-user identifier passed to the provider for abuse monitoring. */
  user?: string;
}

/** Result of a successful image generation. */
export interface ImageGenResult {
  /** The model that produced the image. */
  model: string;
  /** The provider id. */
  provider: ImageProviderId;
  /** Public URL (when the provider returns one) — null when only the buffer is returned. */
  url: string | null;
  /** Image bytes (Base64-encoded) when the provider returns binary. */
  b64: string | null;
  /** MIME type of the produced image (default `image/png`). */
  mimeType: string;
  /** Re-run seed when the provider echoes it back. */
  seed: number | null;
  /** Provider-reported raw response (for debugging / support tickets). */
  raw?: unknown;
}

/** Catalog entry for an image model offered by a provider. */
export interface ImageModel {
  id: string;
  provider: ImageProviderId;
  /** Human-friendly label. */
  label: string;
  /** Maximum output size, e.g. `1792x1024`. */
  maxSize: string | null;
  /** Supported style keys; null = all styles supported. */
  supportedStyles: string[] | null;
  /** Whether this model is currently enabled (defaults to true). */
  isActive: boolean;
  /** Short description shown in the picker. */
  description?: string;
}

/** Result of an image edit operation (enhance / upscale / remove-bg). */
export interface ImageEditResult extends ImageGenResult {
  /** The edit operation that was applied. */
  operation: ImageEditOperation;
}
