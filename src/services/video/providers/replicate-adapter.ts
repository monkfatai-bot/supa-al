/**
 * Replicate video provider adapter.
 */

import type {
  VideoProviderAdapter,
  VideoGenerationRequest,
  VideoSubmitResponse,
  VideoPollResponse,
  VideoModelInfo,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

const REPLICATE_API_URL = "https://api.replicate.com/v1";

const REPLICATE_MODELS: Record<string, string> = {
  "flux-video": "minimax/video-01",
  "stable-video-diffusion": "stability-ai/stable-video-diffusion",
};

function getApiKey(): string {
  if (!env.REPLICATE_API_KEY) {
    throw {
      message: "Replicate API key is not configured. Please set REPLICATE_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "replicate",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.REPLICATE_API_KEY;
}

function getReplicateModel(modelId: string): string {
  const model = REPLICATE_MODELS[modelId];
  if (!model) throw new Error("Unknown Replicate video model: " + modelId);
  return model;
}

const MODELS: VideoModelInfo[] = [
  {
    id: "flux-video",
    name: "Flux Video",
    provider: "replicate",
    description: "Flux video model via Replicate",
    supportedResolutions: ["1280x720", "1024x576", "768x432"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedGenerationTypes: ["text-to-video", "image-to-video"],
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
    description: "Stability AI's video model via Replicate",
    supportedResolutions: ["1280x720", "1024x576", "768x432"],
    supportedAspectRatios: ["16:9", "1:1"],
    supportedGenerationTypes: ["text-to-video", "image-to-video"],
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
];

export const replicateVideoAdapter: VideoProviderAdapter = {
  providerId: "replicate",
  displayName: "Replicate",

  getAvailableModels() {
    return MODELS;
  },

  async submitJob(request: VideoGenerationRequest): Promise<VideoSubmitResponse> {
    const apiKey = getApiKey();
    const replicateModel = getReplicateModel(request.model);

    const input: Record<string, unknown> = {
      prompt: request.prompt,
      aspect_ratio: request.settings.aspectRatio,
    };

    if (request.negativePrompt) input.negative_prompt = request.negativePrompt;
    if (request.settings.seed !== undefined) input.seed = request.settings.seed;
    if (request.settings.durationSeconds) input.duration = request.settings.durationSeconds;

    if (request.sourceImageBase64 && request.generationType === "image-to-video") {
      input.image = "data:image/png;base64," + request.sourceImageBase64;
    }

    logger.debug("Replicate submit job", { model: request.model, replicateModel });

    const submitUrl = REPLICATE_API_URL + "/predictions";
    const resp = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify({
        model: replicateModel,
        input,
      }),
    });

    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => "Unknown error");
      const msg = "Replicate API returned " + resp.status + ": " + errorBody;
      logger.error("Replicate submit error", { status: resp.status, body: errorBody });
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "replicate",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as { id: string; status: string };
    return { providerJobId: data.id, estimatedTimeSeconds: 90 };
  },

  async pollJob(providerJobId: string, _model: string): Promise<VideoPollResponse> {
    const apiKey = getApiKey();

    const pollUrl = REPLICATE_API_URL + "/predictions/" + providerJobId;
    const resp = await fetch(pollUrl, {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
    });

    if (!resp.ok) {
      const msg = "Replicate poll failed: " + resp.status;
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "replicate",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as {
      status: string;
      output?: string | Array<{ url: string }>;
      error?: string;
    };

    if (data.status === "succeeded" && data.output) {
      const videoUrl = typeof data.output === "string" ? data.output : data.output[0]?.url;
      if (videoUrl) {
        return {
          status: "completed",
          progressPercent: 100,
          videoUrl,
          metadata: {
            durationSeconds: 5,
            width: 1280,
            height: 720,
            fps: 24,
          },
        };
      }
    }

    if (data.status === "failed") {
      return {
        status: "failed",
        progressPercent: 0,
        errorMessage: data.error ?? "Replicate generation failed",
      };
    }

    const progress = data.status === "processing" ? 50 : 10;
    return {
      status: data.status === "processing" ? "processing" : "queued",
      progressPercent: progress,
    };
  },

  async cancelJob(providerJobId: string): Promise<void> {
    const apiKey = getApiKey();
    const cancelUrl = REPLICATE_API_URL + "/predictions/" + providerJobId + "/cancel";
    await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
    }).catch(() => {
      logger.warn("Replicate cancel failed", { jobId: providerJobId });
    });
  },
};
