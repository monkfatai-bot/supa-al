/**
 * RunwayML video provider adapter.
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

const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1";

function getApiKey(): string {
  if (!env.RUNWAY_API_KEY) {
    throw {
      message: "Runway API key is not configured. Please set RUNWAY_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "runway",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.RUNWAY_API_KEY;
}

const MODELS: VideoModelInfo[] = [
  {
    id: "runway-gen-4",
    name: "Runway Gen-4",
    provider: "runway",
    description: "Runway's latest generation model with cinematic quality",
    supportedResolutions: ["1920x1080", "1280x720", "1024x576"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedGenerationTypes: ["text-to-video", "image-to-video"],
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
];

export const runwayVideoAdapter: VideoProviderAdapter = {
  providerId: "runway",
  displayName: "RunwayML",

  getAvailableModels() {
    return MODELS;
  },

  async submitJob(request: VideoGenerationRequest): Promise<VideoSubmitResponse> {
    const apiKey = getApiKey();

    const body: Record<string, unknown> = {
      model: request.model,
      promptText: request.prompt,
      duration: request.settings.durationSeconds,
      ratio: request.settings.aspectRatio === "1:1" ? "1:1" : request.settings.aspectRatio === "9:16" ? "9:16" : "16:9",
    };

    if (request.settings.seed !== undefined) body.seed = request.settings.seed;
    if (request.settings.motionStrength !== undefined) body.motionStrength = request.settings.motionStrength;
    if (request.settings.cameraMovement && request.settings.cameraMovement !== "none") body.cameraMotion = request.settings.cameraMovement;
    if (request.settings.creativity !== undefined) body.creativity = request.settings.creativity;

    if (request.sourceImageBase64 && request.generationType === "image-to-video") {
      body.sourceImage = "data:image/png;base64," + request.sourceImageBase64;
    }

    logger.debug("Runway submit job", { model: request.model, type: request.generationType });

    const submitUrl = RUNWAY_API_URL + "/image_to_video";
    const resp = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => "Unknown error");
      const msg = "Runway API returned " + resp.status + ": " + errorBody;
      logger.error("Runway submit error", { status: resp.status, body: errorBody });
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "runway",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as { id: string };
    return { providerJobId: data.id, estimatedTimeSeconds: 120 };
  },

  async pollJob(providerJobId: string, _model: string): Promise<VideoPollResponse> {
    const apiKey = getApiKey();

    const pollUrl = RUNWAY_API_URL + "/tasks/" + providerJobId;
    const resp = await fetch(pollUrl, {
      headers: {
        Authorization: "Bearer " + apiKey,
        "X-Runway-Version": "2024-11-06",
      },
    });

    if (!resp.ok) {
      const msg = "Runway poll failed: " + resp.status;
      throw {
        message: msg,
        code: "PROVIDER_API_ERROR",
        provider: "runway",
        statusCode: resp.status,
        retryable: resp.status >= 500,
      };
    }

    const data = (await resp.json()) as {
      status: string;
      progress: number;
      output?: Array<{ url: string }>;
      failureReason?: string;
    };

    if (data.status === "SUCCEEDED" && data.output && data.output.length > 0) {
      return {
        status: "completed",
        progressPercent: 100,
        videoUrl: data.output[0].url,
        metadata: {
          durationSeconds: 5,
          width: 1280,
          height: 720,
          fps: 24,
        },
      };
    }

    if (data.status === "FAILED") {
      return {
        status: "failed",
        progressPercent: data.progress ?? 0,
        errorMessage: data.failureReason ?? "Runway generation failed",
      };
    }

    return {
      status: data.status === "RUNNING" ? "processing" : "queued",
      progressPercent: Math.min(data.progress ?? 0, 99),
    };
  },

  async cancelJob(providerJobId: string): Promise<void> {
    const apiKey = getApiKey();
    const cancelUrl = RUNWAY_API_URL + "/tasks/" + providerJobId + "/cancel";
    await fetch(cancelUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "X-Runway-Version": "2024-11-06",
      },
    }).catch(() => {
      logger.warn("Runway cancel failed", { jobId: providerJobId });
    });
  },
};
