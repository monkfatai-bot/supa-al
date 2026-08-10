/**
 * Fal.ai video provider adapter.
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

const FAL_API_URL = "https://queue.fal.run";

const FAL_MODELS: Record<string, string> = {
  "fal-kling-video": "fal-ai/kling-video/v1/standard/text-to-video",
};

function getApiKey(): string {
  if (!env.FAL_API_KEY) {
    throw {
      message: "Fal.ai API key is not configured. Please set FAL_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "fal",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.FAL_API_KEY;
}

function getFalModel(modelId: string): string {
  const model = FAL_MODELS[modelId];
  if (!model) throw new Error("Unknown Fal video model: " + modelId);
  return model;
}

const MODELS: VideoModelInfo[] = [
  {
    id: "fal-kling-video",
    name: "Kling Video (Fal)",
    provider: "fal",
    description: "Kling video served via Fal.ai for low latency",
    supportedResolutions: ["1920x1080", "1280x720", "1024x576", "768x768", "768x432", "1080x1920"],
    supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    supportedGenerationTypes: ["text-to-video", "image-to-video"],
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
];

export const falVideoAdapter: VideoProviderAdapter = {
  providerId: "fal",
  displayName: "Fal.ai",

  getAvailableModels() {
    return MODELS;
  },

  async submitJob(request: VideoGenerationRequest): Promise<VideoSubmitResponse> {
    const apiKey = getApiKey();
    const falModel = getFalModel(request.model);
    const endpoint = FAL_API_URL + "/" + falModel;

    const input: Record<string, unknown> = {
      prompt: request.prompt,
      aspect_ratio: request.settings.aspectRatio,
      duration: String(request.settings.durationSeconds),
    };

    if (request.negativePrompt) input.negative_prompt = request.negativePrompt;
    if (request.settings.seed !== undefined) input.seed = request.settings.seed;
    if (request.settings.motionStrength !== undefined) input.motion_strength = request.settings.motionStrength;
    if (request.settings.creativity !== undefined) input.creativity = request.settings.creativity;

    if (request.sourceImageBase64 && request.generationType === "image-to-video") {
      input.image_url = "data:image/png;base64," + request.sourceImageBase64;
    }

    logger.debug("Fal.ai video submit", { model: request.model, falModel });

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Key " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => "Unknown error");
      const msg = "Fal.ai API returned " + resp.status + ": " + errorBody;
      logger.error("Fal.ai submit error", { status: resp.status, body: errorBody });
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "fal",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as {
      request_id?: string;
      status?: string;
      video?: { url: string };
    };

    if (data.video?.url) {
      return { providerJobId: data.request_id ?? "sync-" + Date.now(), estimatedTimeSeconds: 0 };
    }

    if (!data.request_id) {
      throw {
        message: "Fal.ai returned no request_id",
        code: "EMPTY_RESPONSE",
        provider: "fal",
        retryable: false,
      };
    }

    return { providerJobId: data.request_id, estimatedTimeSeconds: 60 };
  },

  async pollJob(providerJobId: string, model: string): Promise<VideoPollResponse> {
    const apiKey = getApiKey();
    const falModel = getFalModel(model);

    const statusUrl = FAL_API_URL + "/" + falModel + "/requests/" + providerJobId + "/status";
    const resultUrl = FAL_API_URL + "/" + falModel + "/requests/" + providerJobId;

    const statusResp = await fetch(statusUrl, {
      headers: { Authorization: "Key " + apiKey },
    });

    if (!statusResp.ok) {
      const msg = "Fal.ai status check failed: " + statusResp.status;
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "fal",
        statusCode: statusResp.status,
        retryable: statusResp.status >= 500,
      };
    }

    const statusData = (await statusResp.json()) as { status: string; queue_position?: number };

    if (statusData.status === "COMPLETED") {
      const resultResp = await fetch(resultUrl, {
        headers: { Authorization: "Key " + apiKey },
      });

      if (!resultResp.ok) {
        throw {
          message: "Fal.ai result fetch failed: " + resultResp.status,
          code: "PROVIDER_API_ERROR",
          provider: "fal",
          retryable: true,
        };
      }

      const resultData = (await resultResp.json()) as {
        video?: { url: string };
      };

      if (resultData.video?.url) {
        return {
          status: "completed",
          progressPercent: 100,
          videoUrl: resultData.video.url,
          metadata: {
            durationSeconds: 5,
            width: 1280,
            height: 720,
            fps: 24,
          },
        };
      }
    }

    if (statusData.status === "FAILED") {
      return {
        status: "failed",
        progressPercent: 0,
        errorMessage: "Fal.ai video generation failed",
      };
    }

    return {
      status: statusData.status === "IN_PROGRESS" ? "processing" : "queued",
      progressPercent: statusData.status === "IN_PROGRESS" ? 50 : 10,
    };
  },

  async cancelJob(providerJobId: string, model: string): Promise<void> {
    const apiKey = getApiKey();
    const falModel = getFalModel(model);
    const cancelUrl = FAL_API_URL + "/" + falModel + "/requests/" + providerJobId + "/cancel";
    await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: "Key " + apiKey },
    }).catch(() => {
      logger.warn("Fal.ai cancel failed", { jobId: providerJobId });
    });
  },
};
