/**
 * Google Veo video provider adapter (stub — when available).
 * Placeholder that will be activated once Google Veo API is publicly available.
 */

import type {
  VideoProviderAdapter,
  VideoGenerationRequest,
  VideoSubmitResponse,
  VideoPollResponse,
  VideoModelInfo,
} from "../types";

const MODELS: VideoModelInfo[] = [
  {
    id: "google-veo",
    name: "Google Veo",
    provider: "google-video",
    description: "Google's Veo video generation model (when available)",
    supportedResolutions: ["1280x720", "1024x576", "768x432"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedGenerationTypes: ["text-to-video"],
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
];

export const googleVideoAdapter: VideoProviderAdapter = {
  providerId: "google-video",
  displayName: "Google Veo",

  getAvailableModels() {
    return MODELS;
  },

  async submitJob(_request: VideoGenerationRequest): Promise<VideoSubmitResponse> {
    throw {
      message: "Google Veo is not yet available. Please check back later.",
      code: "PROVIDER_NOT_AVAILABLE",
      provider: "google-video",
      statusCode: 503,
      retryable: false,
    };
  },

  async pollJob(_providerJobId: string, _model: string): Promise<VideoPollResponse> {
    throw {
      message: "Google Veo is not yet available.",
      code: "PROVIDER_NOT_AVAILABLE",
      provider: "google-video",
      retryable: false,
    };
  },
};
