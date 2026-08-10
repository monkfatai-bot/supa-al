/**
 * Fal.ai image provider adapter.
 * Low-latency inference for Flux and other models.
 */

import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModelInfo,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

const FAL_API_URL = "https://queue.fal.run";

const FAL_MODELS: Record<string, string> = {
  "fal-flux-pro": "fal-ai/flux-pro/v1.1",
};

const MODELS: ImageModelInfo[] = [
  {
    id: "fal-flux-pro",
    name: "Flux Pro (Fal)",
    provider: "fal",
    description: "Flux Pro served via Fal.ai for low latency",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536", "2048x2048"],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    supportedGenerationTypes: ["text-to-image", "image-to-image"],
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
];

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
  if (!model) throw new Error(`Unknown Fal model: ${modelId}`);
  return model;
}

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const falImageAdapter: ImageProviderAdapter = {
  providerId: "fal",
  displayName: "Fal.ai",

  getAvailableModels() {
    return MODELS;
  },

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const apiKey = getApiKey();
    const falModel = getFalModel(request.model);
    const endpoint = `${FAL_API_URL}/${falModel}`;

    const [w, h] = request.settings.size.split("x").map(Number);

    const input: Record<string, unknown> = {
      prompt: request.prompt,
      image_size: { width: w, height: h },
      num_images: request.settings.numImages,
    };
    if (request.negativePrompt) input.negative_prompt = request.negativePrompt;
    if (request.settings.seed !== undefined) input.seed = request.settings.seed;
    if (request.settings.guidanceScale !== undefined) input.guidance_scale = request.settings.guidanceScale;
    if (request.settings.steps !== undefined) input.num_inference_steps = request.settings.steps;

    if (request.sourceImageBase64) {
      input.image_url = `data:image/png;base64,${request.sourceImageBase64}`;
      if (request.settings.strength !== undefined) input.strength = request.settings.strength;
    }

    logger.debug("Fal.ai image request", { model: request.model, size: request.settings.size });

    // Submit request
    const submitResp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    if (!submitResp.ok) {
      const errorBody = await submitResp.text().catch(() => "Unknown error");
      logger.error("Fal.ai submit error", { status: submitResp.status, body: errorBody });
      throw {
        message: `Fal.ai API returned ${submitResp.status}: ${errorBody}`,
        code: "PROVIDER_API_ERROR",
        provider: "fal",
        statusCode: submitResp.status,
        retryable: submitResp.status >= 500,
      };
    }

    const submitData = (await submitResp.json()) as {
      request_id?: string;
      status?: string;
      images?: Array<{ url: string }>;
    };

    // If already completed (synchronous)
    if (submitData.images && submitData.images.length > 0) {
      const results = await Promise.all(
        submitData.images.map(async (img) => {
          const resp = await fetch(img.url);
          const buffer = await resp.arrayBuffer();
          return { imageData: Buffer.from(buffer).toString("base64") };
        })
      );
      return { results, model: request.model, provider: "fal" };
    }

    // Poll for result
    if (!submitData.request_id) {
      throw {
        message: "Fal.ai returned no request_id and no images",
        code: "EMPTY_RESPONSE",
        provider: "fal",
        retryable: false,
      };
    }

    const statusUrl = `${FAL_API_URL}/${falModel}/requests/${submitData.request_id}/status`;
    const resultUrl = `${FAL_API_URL}/${falModel}/requests/${submitData.request_id}`;

    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);

      const statusResp = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!statusResp.ok) continue;

      const statusData = (await statusResp.json()) as { status: string };
      if (statusData.status === "COMPLETED") break;
      if (statusData.status === "FAILED") {
        throw {
          message: "Fal.ai generation failed",
          code: "PROVIDER_API_ERROR",
          provider: "fal",
          retryable: false,
        };
      }
    }

    const resultResp = await fetch(resultUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });

    if (!resultResp.ok) {
      throw {
        message: `Fal.ai result fetch failed: ${resultResp.status}`,
        code: "PROVIDER_API_ERROR",
        provider: "fal",
        retryable: true,
      };
    }

    const resultData = (await resultResp.json()) as {
      images?: Array<{ url: string }>;
    };

    if (!resultData.images || resultData.images.length === 0) {
      throw {
        message: "No images returned from Fal.ai",
        code: "EMPTY_RESPONSE",
        provider: "fal",
        retryable: false,
      };
    }

    const results = await Promise.all(
      resultData.images.map(async (img) => {
        const resp = await fetch(img.url);
        const buffer = await resp.arrayBuffer();
        return { imageData: Buffer.from(buffer).toString("base64") };
      })
    );

    return { results, model: request.model, provider: "fal" };
  },
};
