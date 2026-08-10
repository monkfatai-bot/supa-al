/**
 * Central video model registry.
 * Each model is tagged with its provider so the
 * correct adapter can be resolved at request time.
 */

import type { VideoModelInfo, VideoResolution, VideoAspectRatio, VideoGenerationType } from "./types";

// ─── Resolution helpers ────────────────────────────────────

const RES_720P: VideoResolution[] = ["1280x720", "1024x576", "768x432"];
const RES_1080P: VideoResolution[] = ["1920x1080", "1280x720", "1024x576"];
const RES_ALL: VideoResolution[] = ["1920x1080", "1280x720", "1024x576", "768x768", "768x432", "1080x1920"];

const AR_WIDE: VideoAspectRatio[] = ["16:9", "9:16", "1:1"];
const AR_FULL: VideoAspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4"];

const T2V: VideoGenerationType[] = ["text-to-video"];
const T2V_I2V: VideoGenerationType[] = ["text-to-video", "image-to-video"];
const T2V_I2V_V2V: VideoGenerationType[] = ["text-to-video", "image-to-video", "video-to-video"];

// ─── Model registry ────────────────────────────────────────

export const AVAILABLE_VIDEO_MODELS: VideoModelInfo[] = [
  // ── RunwayML ──
  {
    id: "runway-gen-4",
    name: "Runway Gen-4",
    provider: "runway",
    description: "Runway's latest generation model with cinematic quality and high fidelity motion",
    supportedResolutions: RES_1080P,
    supportedAspectRatios: AR_WIDE,
    supportedGenerationTypes: T2V_I2V,
    maxDurationSeconds: 10,
    maxFps: 24,
    creditCost: 20,
    quality: "ultra",
    speed: "slow",
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsMotionStrength: true,
    supportsCameraMovement: true,
    supportsStylePreset: false,
    supportsCreativity: true,
    supportsImageInput: true,
    supportsVideoInput: false,
    enabled: true,
  },

  // ── Kling AI ──
  {
    id: "kling-2",
    name: "Kling 2.0",
    provider: "kling",
    description: "Kling AI v2 with realistic human motion and high-quality video generation",
    supportedResolutions: RES_ALL,
    supportedAspectRatios: AR_FULL,
    supportedGenerationTypes: T2V_I2V_V2V,
    maxDurationSeconds: 10,
    maxFps: 30,
    creditCost: 15,
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsMotionStrength: true,
    supportsCameraMovement: true,
    supportsStylePreset: true,
    supportsCreativity: true,
    supportsImageInput: true,
    supportsVideoInput: true,
    enabled: true,
  },

  // ── Luma AI ──
  {
    id: "luma-dream-machine",
    name: "Luma Dream Machine",
    provider: "luma",
    description: "Luma's Dream Machine for high-quality video generation with realistic motion",
    supportedResolutions: RES_720P,
    supportedAspectRatios: AR_WIDE,
    supportedGenerationTypes: T2V_I2V,
    maxDurationSeconds: 5,
    maxFps: 24,
    creditCost: 12,
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsMotionStrength: true,
    supportsCameraMovement: false,
    supportsStylePreset: false,
    supportsCreativity: true,
    supportsImageInput: true,
    supportsVideoInput: false,
    enabled: true,
  },

  // ── Pika Labs ──
  {
    id: "pika-turbo",
    name: "Pika Turbo",
    provider: "pika",
    description: "Pika's fast video generation model with creative style options",
    supportedResolutions: RES_720P,
    supportedAspectRatios: AR_WIDE,
    supportedGenerationTypes: T2V_I2V,
    maxDurationSeconds: 4,
    maxFps: 24,
    creditCost: 10,
    quality: "medium",
    speed: "fast",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsMotionStrength: true,
    supportsCameraMovement: true,
    supportsStylePreset: true,
    supportsCreativity: true,
    supportsImageInput: true,
    supportsVideoInput: false,
    enabled: true,
  },

  // ── Replicate (multiple models) ──
  {
    id: "flux-video",
    name: "Flux Video",
    provider: "replicate",
    description: "Flux video model via Replicate with high-quality output",
    supportedResolutions: RES_720P,
    supportedAspectRatios: AR_WIDE,
    supportedGenerationTypes: T2V_I2V,
    maxDurationSeconds: 5,
    maxFps: 24,
    creditCost: 15,
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsMotionStrength: false,
    supportsCameraMovement: false,
    supportsStylePreset: false,
    supportsCreativity: false,
    supportsImageInput: true,
    supportsVideoInput: false,
    enabled: true,
  },
  {
    id: "stable-video-diffusion",
    name: "Stable Video Diffusion",
    provider: "replicate",
    description: "Stability AI's video generation model via Replicate",
    supportedResolutions: RES_720P,
    supportedAspectRatios: ["16:9", "1:1"],
    supportedGenerationTypes: T2V_I2V,
    maxDurationSeconds: 4,
    maxFps: 24,
    creditCost: 10,
    quality: "medium",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsMotionStrength: false,
    supportsCameraMovement: false,
    supportsStylePreset: false,
    supportsCreativity: false,
    supportsImageInput: true,
    supportsVideoInput: false,
    enabled: true,
  },

  // ── Fal.ai ──
  {
    id: "fal-kling-video",
    name: "Kling Video (Fal)",
    provider: "fal",
    description: "Kling video served via Fal.ai for low-latency generation",
    supportedResolutions: RES_ALL,
    supportedAspectRatios: AR_FULL,
    supportedGenerationTypes: T2V_I2V,
    maxDurationSeconds: 10,
    maxFps: 30,
    creditCost: 12,
    quality: "high",
    speed: "fast",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsMotionStrength: true,
    supportsCameraMovement: true,
    supportsStylePreset: false,
    supportsCreativity: true,
    supportsImageInput: true,
    supportsVideoInput: false,
    enabled: true,
  },

  // ── Google Veo (when available) ──
  {
    id: "google-veo",
    name: "Google Veo",
    provider: "google-video",
    description: "Google's Veo video generation model (when available)",
    supportedResolutions: RES_720P,
    supportedAspectRatios: AR_WIDE,
    supportedGenerationTypes: T2V,
    maxDurationSeconds: 8,
    maxFps: 24,
    creditCost: 15,
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsMotionStrength: false,
    supportsCameraMovement: false,
    supportsStylePreset: false,
    supportsCreativity: false,
    supportsImageInput: false,
    supportsVideoInput: false,
    enabled: false,
  },

  // ── OpenAI Video (when available) ──
  {
    id: "openai-video",
    name: "OpenAI Video",
    provider: "openai-video",
    description: "OpenAI's video generation model (when available)",
    supportedResolutions: RES_1080P,
    supportedAspectRatios: AR_WIDE,
    supportedGenerationTypes: T2V,
    maxDurationSeconds: 10,
    maxFps: 24,
    creditCost: 20,
    quality: "ultra",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsMotionStrength: false,
    supportsCameraMovement: false,
    supportsStylePreset: false,
    supportsCreativity: false,
    supportsImageInput: false,
    supportsVideoInput: false,
    enabled: false,
  },
];

// ─── Query helpers ─────────────────────────────────────────

/** Find a model by its ID. Returns undefined if not found. */
export function getVideoModelById(modelId: string): VideoModelInfo | undefined {
  return AVAILABLE_VIDEO_MODELS.find((m) => m.id === modelId);
}

/** Get the default video model. */
export function getDefaultVideoModel(): VideoModelInfo {
  const enabled = AVAILABLE_VIDEO_MODELS.filter((m) => m.enabled);
  return enabled[0] ?? AVAILABLE_VIDEO_MODELS[0];
}

/** Get all enabled models. */
export function getEnabledVideoModels(): VideoModelInfo[] {
  return AVAILABLE_VIDEO_MODELS.filter((m) => m.enabled);
}

/** Get models grouped by provider. */
export function getVideoModelsByProvider(): Record<string, VideoModelInfo[]> {
  const grouped: Record<string, VideoModelInfo[]> = {};
  for (const model of AVAILABLE_VIDEO_MODELS) {
    if (!grouped[model.provider]) grouped[model.provider] = [];
    grouped[model.provider].push(model);
  }
  return grouped;
}

/** Get all unique provider IDs from video models. */
export function getVideoProviders(): string[] {
  return [...new Set(AVAILABLE_VIDEO_MODELS.map((m) => m.provider))];
}

/** Resolve a provider ID from a model ID. Throws if not found. */
export function resolveVideoProvider(modelId: string): string {
  const model = getVideoModelById(modelId);
  if (!model) throw new Error(`Unknown video model: ${modelId}`);
  return model.provider;
}
