/**
 * Central image model registry.
 * Each model is tagged with its provider so the
 * correct adapter can be resolved at request time.
 */

import type { ImageModelInfo, ImageSize, AspectRatio, ImageGenerationType } from "./types";

// ─── Resolution helpers ────────────────────────────────────

const SQ_1024: ImageSize[] = ["1024x1024"];
const ALL_STD: ImageSize[] = ["1024x1024", "1792x1024", "1024x1792"];
const SDXL_SIZES: ImageSize[] = ["1024x1024", "1536x1024", "1024x1536"];
const FLUX_SIZES: ImageSize[] = ["1024x1024", "1536x1024", "1024x1536", "2048x2048"];

const AR_SQUARE: AspectRatio[] = ["1:1"];
const AR_STD: AspectRatio[] = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const AR_FULL: AspectRatio[] = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];

const T2I: ImageGenerationType[] = ["text-to-image"];
const T2I_I2I: ImageGenerationType[] = ["text-to-image", "image-to-image"];

// ─── Model registry ────────────────────────────────────────

export const AVAILABLE_IMAGE_MODELS: ImageModelInfo[] = [
  // ── OpenAI ──
  {
    id: "gpt-image-1",
    name: "GPT Image",
    provider: "openai",
    description: "OpenAI's latest image generation model with excellent prompt understanding",
    supportedSizes: ALL_STD,
    supportedAspectRatios: AR_STD,
    supportedGenerationTypes: T2I_I2I,
    creditCost: 5,
    maxResolution: "1792x1792",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsGuidanceScale: false,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 1,
    enabled: true,
  },
  {
    id: "dall-e-3",
    name: "DALL-E 3",
    provider: "openai",
    description: "High-quality image generation with strong prompt adherence",
    supportedSizes: ALL_STD,
    supportedAspectRatios: AR_SQUARE,
    supportedGenerationTypes: T2I,
    creditCost: 4,
    maxResolution: "1792x1792",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsGuidanceScale: false,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 1,
    enabled: true,
  },

  // ── Stability AI ──
  {
    id: "stable-diffusion-xl-1.0",
    name: "SDXL 1.0",
    provider: "stability",
    description: "Stable Diffusion XL — high-quality open model",
    supportedSizes: SDXL_SIZES,
    supportedAspectRatios: AR_STD,
    supportedGenerationTypes: T2I_I2I,
    creditCost: 3,
    maxResolution: "1536x1536",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },
  {
    id: "stable-diffusion-xl-0.9",
    name: "SDXL 0.9",
    provider: "stability",
    description: "Previous generation Stable Diffusion XL",
    supportedSizes: SDXL_SIZES,
    supportedAspectRatios: AR_STD,
    supportedGenerationTypes: T2I_I2I,
    creditCost: 2,
    maxResolution: "1024x1024",
    quality: "medium",
    speed: "fast",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },

  // ── Replicate / Flux ──
  {
    id: "flux-pro",
    name: "Flux Pro",
    provider: "replicate",
    description: "Black Forest Labs Flux Pro — highest quality open model",
    supportedSizes: FLUX_SIZES,
    supportedAspectRatios: AR_FULL,
    supportedGenerationTypes: T2I_I2I,
    creditCost: 5,
    maxResolution: "2048x2048",
    quality: "ultra",
    speed: "slow",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },
  {
    id: "flux-schnell",
    name: "Flux Schnell",
    provider: "replicate",
    description: "Black Forest Labs Flux Schnell — fast generation mode",
    supportedSizes: FLUX_SIZES,
    supportedAspectRatios: AR_FULL,
    supportedGenerationTypes: T2I,
    creditCost: 2,
    maxResolution: "2048x2048",
    quality: "medium",
    speed: "fast",
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsGuidanceScale: false,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 4,
    enabled: true,
  },
  {
    id: "flux-dev",
    name: "Flux Dev",
    provider: "replicate",
    description: "Black Forest Labs Flux Dev — balanced quality and speed",
    supportedSizes: FLUX_SIZES,
    supportedAspectRatios: AR_FULL,
    supportedGenerationTypes: T2I_I2I,
    creditCost: 3,
    maxResolution: "2048x2048",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },

  // ── Ideogram ──
  {
    id: "ideogram-v3",
    name: "Ideogram V3",
    provider: "ideogram",
    description: "Ideogram V3 — excellent text rendering in images",
    supportedSizes: SQ_1024,
    supportedAspectRatios: AR_SQUARE,
    supportedGenerationTypes: T2I,
    creditCost: 3,
    maxResolution: "1024x1024",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 4,
    enabled: true,
  },

  // ── Fal.ai ──
  {
    id: "fal-flux-pro",
    name: "Flux Pro (Fal)",
    provider: "fal",
    description: "Flux Pro served via Fal.ai for low latency",
    supportedSizes: FLUX_SIZES,
    supportedAspectRatios: AR_FULL,
    supportedGenerationTypes: T2I_I2I,
    creditCost: 4,
    maxResolution: "2048x2048",
    quality: "ultra",
    speed: "fast",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },

  // ── Google Gemini ──
  {
    id: "gemini-image",
    name: "Gemini Image",
    provider: "google-image",
    description: "Google Gemini image generation capabilities",
    supportedSizes: SQ_1024,
    supportedAspectRatios: AR_SQUARE,
    supportedGenerationTypes: T2I,
    creditCost: 3,
    maxResolution: "1024x1024",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsGuidanceScale: false,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 1,
    enabled: true,
  },

  // ── Additional models from spec ──
  {
    id: "realistic-vision-v6",
    name: "Realistic Vision",
    provider: "replicate",
    description: "Photorealistic image generation model",
    supportedSizes: SDXL_SIZES,
    supportedAspectRatios: AR_STD,
    supportedGenerationTypes: T2I_I2I,
    creditCost: 2,
    maxResolution: "1536x1536",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },
  {
    id: "juggernaut-xl",
    name: "Juggernaut XL",
    provider: "replicate",
    description: "Highly detailed realistic photography model",
    supportedSizes: SDXL_SIZES,
    supportedAspectRatios: AR_STD,
    supportedGenerationTypes: T2I_I2I,
    creditCost: 2,
    maxResolution: "1536x1536",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },
];

// ─── Query helpers ─────────────────────────────────────────

/** Find a model by its ID. Returns undefined if not found. */
export function getImageModelById(modelId: string): ImageModelInfo | undefined {
  return AVAILABLE_IMAGE_MODELS.find((m) => m.id === modelId);
}

/** Get the default image model. */
export function getDefaultImageModel(): ImageModelInfo {
  const enabled = AVAILABLE_IMAGE_MODELS.filter((m) => m.enabled);
  return enabled[0] ?? AVAILABLE_IMAGE_MODELS[0];
}

/** Get all enabled models. */
export function getEnabledImageModels(): ImageModelInfo[] {
  return AVAILABLE_IMAGE_MODELS.filter((m) => m.enabled);
}

/** Get models grouped by provider. */
export function getImageModelsByProvider(): Record<string, ImageModelInfo[]> {
  const grouped: Record<string, ImageModelInfo[]> = {};
  for (const model of AVAILABLE_IMAGE_MODELS) {
    if (!grouped[model.provider]) grouped[model.provider] = [];
    grouped[model.provider].push(model);
  }
  return grouped;
}

/** Get all unique provider IDs from image models. */
export function getImageProviders(): string[] {
  return [...new Set(AVAILABLE_IMAGE_MODELS.map((m) => m.provider))];
}

/** Resolve a provider ID from a model ID. Throws if not found. */
export function resolveImageProvider(modelId: string): string {
  const model = getImageModelById(modelId);
  if (!model) throw new Error(`Unknown image model: ${modelId}`);
  return model.provider;
}
