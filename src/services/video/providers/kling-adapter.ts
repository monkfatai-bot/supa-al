/**
 * Kling AI video provider adapter.
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

const KLING_API_URL = "https://api.klingai.com/v1";

function getApiKey(): string {
  if (!env.KLING_API_KEY) {
    throw {
      message: "Kling API key is not configured. Please set KLING_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "kling",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.KLING_API_KEY;
}

const MODELS: VideoModelInfo[] = [
  {
    id: "kling-2",
    name: "Kling 2.0",
    provider: "kling",
    description: "Kling AI v2 with realistic human motion",
    supportedResolutions: ["1920x1080", "1280x720", "1024x576", "768x768", "768x432", "1080x1920"],
    supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    supportedGenerationTypes: ["text-to-video", "image-to-video", "video-to-video"],
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
];

export const klingVideoAdapter: VideoProviderAdapter = {
  providerId: "kling",
  displayName: "Kling AI",

  getAvailableModels() {
    return MODELS;
  },

  async submitJob(request: VideoGenerationRequest): Promise<VideoSubmitResponse> {
    const apiKey = getApiKey();

    const body: Record<string, unknown> = {
      model_name: request.model,
      prompt: request.prompt,
      duration: String(request.settings.durationSeconds),
      aspect_ratio: request.settings.aspectRatio,
    };

    if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
    if (request.settings.seed !== undefined) body.seed = request.settings.seed;
    if (request.settings.motionStrength !== undefined) body.cfg_scale = request.settings.motionStrength;
    if (request.settings.cameraMovement && request.settings.cameraMovement !== "none") {
      body.camera_control = { type: request.settings.cameraMovement };
    }
    if (request.settings.creativity !== undefined) body.creativity = request.settings.creativity;

    if (request.sourceImageBase64 && request.generationType === "image-to-video") {
      body.image = "data:image/png;base64," + request.sourceImageBase64;
    }

    if (request.sourceVideoBase64 && request.generationType === "video-to-video") {
      body.video = "data:video/mp4;base64," + request.sourceVideoBase64;
    }

    logger.debug("Kling submit job", { model: request.model, type: request.generationType });

    const submitUrl = KLING_API_URL + "/videos/text2video";
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
      const msg = "Kling API returned " + resp.status + ": " + errorBody;
      logger.error("Kling submit error", { status: resp.status, body: errorBody });
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "kling",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as {
      task_id: string;
      estimated_time?: number;
    };
    return { providerJobId: data.task_id, estimatedTimeSeconds: data.estimated_time ?? 90 };
  },

  async pollJob(providerJobId: string, _model: string): Promise<VideoPollResponse> {
    const apiKey = getApiKey();

    const pollUrl = KLING_API_URL + "/videos/image2video/" + providerJobId;
    const resp = await fetch(pollUrl, {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
    });

    if (!resp.ok) {
      const msg = "Kling poll failed: " + resp.status;
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "kling",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as {
      task_status: string;
      progress: number;
      task_result?: {
        videos?: Array<{ url: string }>;
        duration?: number;
      };
      error?: string;
    };

    if (data.task_status === "succeed" && data.task_result?.videos?.[0]) {
      return {
        status: "completed",
        progressPercent: 100,
        videoUrl: data.task_result.videos[0].url,
        metadata: {
          durationSeconds: data.task_result.duration ?? 5,
          width: 1280,
          height: 720,
          fps: 24,
        },
      };
    }

    if (data.task_status === "failed") {
      return {
        status: "failed",
        progressPercent: data.progress ?? 0,
        errorMessage: data.error ?? "Kling generation failed",
      };
    }

    return {
      status: "processing",
      progressPercent: Math.min(data.progress ?? 0, 99),
    };
  },

  async cancelJob(providerJobId: string): Promise<void> {
    const apiKey = getApiKey();
    const cancelUrl = KLING_API_URL + "/videos/cancel/" + providerJobId;
    await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
    }).catch(() => {
      logger.warn("Kling cancel failed", { jobId: providerJobId });
    });
  },
};
