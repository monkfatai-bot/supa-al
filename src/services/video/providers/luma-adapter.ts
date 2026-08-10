/**
 * Luma AI Dream Machine video provider adapter.
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

const LUMA_API_URL = "https://api.lumalabs.ai/dream-machine/v1";

function getApiKey(): string {
  if (!env.LUMA_API_KEY) {
    throw {
      message: "Luma API key is not configured. Please set LUMA_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "luma",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.LUMA_API_KEY;
}

const MODELS: VideoModelInfo[] = [
  {
    id: "luma-dream-machine",
    name: "Luma Dream Machine",
    provider: "luma",
    description: "Luma's Dream Machine for high-quality video generation",
    supportedResolutions: ["1280x720", "1024x576", "768x432"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedGenerationTypes: ["text-to-video", "image-to-video"],
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
];

export const lumaVideoAdapter: VideoProviderAdapter = {
  providerId: "luma",
  displayName: "Luma AI",

  getAvailableModels() {
    return MODELS;
  },

  async submitJob(request: VideoGenerationRequest): Promise<VideoSubmitResponse> {
    const apiKey = getApiKey();

    const body: Record<string, unknown> = {
      prompt: request.prompt,
      aspect_ratio: request.settings.aspectRatio,
    };

    if (request.settings.motionStrength !== undefined) {
      body.motion_strength = request.settings.motionStrength;
    }
    if (request.settings.creativity !== undefined) {
      body.creativity = request.settings.creativity;
    }

    if (request.sourceImageBase64 && request.generationType === "image-to-video") {
      body.image_url = "data:image/png;base64," + request.sourceImageBase64;
    }

    logger.debug("Luma submit job", { model: request.model, type: request.generationType });

    const submitUrl = LUMA_API_URL + "/generations";
    const resp = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => "Unknown error");
      const msg = "Luma API returned " + resp.status + ": " + errorBody;
      logger.error("Luma submit error", { status: resp.status, body: errorBody });
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "luma",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as { id: string; state: string };
    return { providerJobId: data.id, estimatedTimeSeconds: 60 };
  },

  async pollJob(providerJobId: string, _model: string): Promise<VideoPollResponse> {
    const apiKey = getApiKey();

    const pollUrl = LUMA_API_URL + "/generations/" + providerJobId;
    const resp = await fetch(pollUrl, {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
    });

    if (!resp.ok) {
      const msg = "Luma poll failed: " + resp.status;
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "luma",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as {
      state: string;
      progress: number;
      assets?: { video?: string; thumbnail?: string };
      failure_reason?: string;
    };

    if (data.state === "completed" && data.assets?.video) {
      return {
        status: "completed",
        progressPercent: 100,
        videoUrl: data.assets.video,
        thumbnailUrl: data.assets.thumbnail,
        metadata: {
          durationSeconds: 5,
          width: 1280,
          height: 720,
          fps: 24,
        },
      };
    }

    if (data.state === "failed") {
      return {
        status: "failed",
        progressPercent: data.progress ?? 0,
        errorMessage: data.failure_reason ?? "Luma generation failed",
      };
    }

    return {
      status: data.state === "processing" ? "processing" : "queued",
      progressPercent: Math.min(data.progress ?? 0, 99),
    };
  },

  async cancelJob(providerJobId: string): Promise<void> {
    const apiKey = getApiKey();
    const cancelUrl = LUMA_API_URL + "/generations/" + providerJobId + "/cancel";
    await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
    }).catch(() => {
      logger.warn("Luma cancel failed", { jobId: providerJobId });
    });
  },
};
