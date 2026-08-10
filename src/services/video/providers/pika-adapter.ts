/**
 * Pika Labs video provider adapter.
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

const PIKA_API_URL = "https://api.pika.art/v1";

function getApiKey(): string {
  if (!env.PIKA_API_KEY) {
    throw {
      message: "Pika API key is not configured. Please set PIKA_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "pika",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.PIKA_API_KEY;
}

const MODELS: VideoModelInfo[] = [
  {
    id: "pika-turbo",
    name: "Pika Turbo",
    provider: "pika",
    description: "Pika's fast video generation with creative style options",
    supportedResolutions: ["1280x720", "1024x576", "768x432"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedGenerationTypes: ["text-to-video", "image-to-video"],
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
];

export const pikaVideoAdapter: VideoProviderAdapter = {
  providerId: "pika",
  displayName: "Pika Labs",

  getAvailableModels() {
    return MODELS;
  },

  async submitJob(request: VideoGenerationRequest): Promise<VideoSubmitResponse> {
    const apiKey = getApiKey();

    const body: Record<string, unknown> = {
      prompt: request.prompt,
      model: request.model,
      parameters: {
        aspect_ratio: request.settings.aspectRatio,
        fps: request.settings.fps,
        motion_strength: request.settings.motionStrength ?? 5,
      },
    };

    if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
    if (request.settings.seed !== undefined) body.seed = request.settings.seed;
    if (request.settings.cameraMovement && request.settings.cameraMovement !== "none") {
      (body.parameters as Record<string, unknown>).camera = request.settings.cameraMovement;
    }
    if (request.settings.stylePreset) (body.parameters as Record<string, unknown>).style = request.settings.stylePreset;
    if (request.settings.creativity !== undefined) (body.parameters as Record<string, unknown>).creativity = request.settings.creativity;

    if (request.sourceImageBase64 && request.generationType === "image-to-video") {
      body.image = "data:image/png;base64," + request.sourceImageBase64;
    }

    logger.debug("Pika submit job", { model: request.model, type: request.generationType });

    const submitUrl = PIKA_API_URL + "/generate";
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
      const msg = "Pika API returned " + resp.status + ": " + errorBody;
      logger.error("Pika submit error", { status: resp.status, body: errorBody });
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "pika",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as { id: string };
    return { providerJobId: data.id, estimatedTimeSeconds: 45 };
  },

  async pollJob(providerJobId: string, _model: string): Promise<VideoPollResponse> {
    const apiKey = getApiKey();

    const pollUrl = PIKA_API_URL + "/generations/" + providerJobId;
    const resp = await fetch(pollUrl, {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
    });

    if (!resp.ok) {
      const msg = "Pika poll failed: " + resp.status;
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "pika",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as {
      status: string;
      progress: number;
      video_url?: string;
      thumbnail_url?: string;
      error?: string;
    };

    if (data.status === "completed" && data.video_url) {
      return {
        status: "completed",
        progressPercent: 100,
        videoUrl: data.video_url,
        thumbnailUrl: data.thumbnail_url,
        metadata: {
          durationSeconds: 4,
          width: 1280,
          height: 720,
          fps: 24,
        },
      };
    }

    if (data.status === "failed") {
      return {
        status: "failed",
        progressPercent: data.progress ?? 0,
        errorMessage: data.error ?? "Pika generation failed",
      };
    }

    return {
      status: data.status === "processing" ? "processing" : "queued",
      progressPercent: Math.min(data.progress ?? 0, 99),
    };
  },

  async cancelJob(providerJobId: string): Promise<void> {
    const apiKey = getApiKey();
    const cancelUrl = PIKA_API_URL + "/generations/" + providerJobId + "/cancel";
    await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
    }).catch(() => {
      logger.warn("Pika cancel failed", { jobId: providerJobId });
    });
  },
};
