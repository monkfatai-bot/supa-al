/**
 * OpenAI Video provider adapter (stub — when available).
 * Placeholder that will be activated once OpenAI releases a video API.
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
    id: "openai-video",
    name: "OpenAI Video",
    provider: "openai-video",
    description: "OpenAI's video generation model (when available)",
    supportedResolutions: ["1920x1080", "1280x720", "1024x576"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedGenerationTypes: ["text-to-video"],
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

export const openaiVideoAdapter: VideoProviderAdapter = {
  providerId: "openai-video",
  displayName: "OpenAI Video",

  getAvailableModels() {
    return MODELS;
  },

  async submitJob(_request: VideoGenerationRequest): Promise<VideoSubmitResponse> {
    throw {
      message: "OpenAI Video is not yet available. Please check back later.",
      code: "PROVIDER_NOT_AVAILABLE",
      provider: "openai-video",
      statusCode: 503,
      retryable: false,
    };
  },

  async pollJob(_providerJobId: string, _model: string): Promise<VideoPollResponse> {
    throw {
      message: "OpenAI Video is not yet available.",
      code: "PROVIDER_NOT_AVAILABLE",
      provider: "openai-video",
      retryable: false,
    };
  },
};
