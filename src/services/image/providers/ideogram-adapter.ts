/**
 * Ideogram image provider adapter.
 * Uses the Ideogram API for high-quality image generation with text rendering.
 */

import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModelInfo,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

const IDEOGRAM_API_URL = "https://api.ideogram.ai/api/generate";

const MODELS: ImageModelInfo[] = [
  {
    id: "ideogram-v3",
    name: "Ideogram V3",
    provider: "ideogram",
    description: "Ideogram V3 — excellent text rendering in images",
    supportedSizes: ["1024x1024"],
    supportedAspectRatios: ["1:1"],
    supportedGenerationTypes: ["text-to-image"],
    creditCost: 3,
    maxResolution: "1024x1024",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 4,
    enabled: true,
  },
];

function getApiKey(): string {
  if (!env.IDEOGRAM_API_KEY) {
    throw {
      message: "Ideogram API key is not configured. Please set IDEOGRAM_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "ideogram",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.IDEOGRAM_API_KEY;
}

export const ideogramImageAdapter: ImageProviderAdapter = {
  providerId: "ideogram",
  displayName: "Ideogram",

  getAvailableModels() {
    return MODELS;
  },

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const apiKey = getApiKey();

    const body: Record<string, unknown> = {
      model: "V_3",
      prompt: request.prompt,
      aspect_ratio: request.settings.aspectRatio ?? "1:1",
      output_format: "PNG",
    };

    if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
    if (request.settings.seed !== undefined) body.seed = request.settings.seed;
    if (request.settings.guidanceScale !== undefined) body.guidance_scale = request.settings.guidanceScale;
    if (request.settings.numImages > 1) body.num_images = request.settings.numImages;

    logger.debug("Ideogram image request", {
      model: request.model,
      aspectRatio: request.settings.aspectRatio,
    });

    const response = await fetch(IDEOGRAM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      logger.error("Ideogram API error", { status: response.status, body: errorBody });
      throw {
        message: `Ideogram API returned ${response.status}: ${errorBody}`,
        code: "PROVIDER_API_ERROR",
        provider: "ideogram",
        statusCode: response.status,
        retryable: response.status >= 500,
      };
    }

    const data = (await response.json()) as {
      data: Array<{ url?: string; b64_json?: string; seed?: number }>; };

    const results = await Promise.all(
      (data.data ?? []).map(async (item) => {
        let imageData: string;
        if (item.b64_json) {
          imageData = item.b64_json;
        } else if (item.url) {
          const resp = await fetch(item.url);
          const buffer = await resp.arrayBuffer();
          imageData = Buffer.from(buffer).toString("base64");
        } else {
          throw {
            message: "No image data in Ideogram response",
            code: "EMPTY_RESPONSE",
            provider: "ideogram",
            retryable: false,
          };
        }
        return { imageData, seed: item.seed };
      })
    );

    if (results.length === 0) {
      throw {
        message: "No images returned from Ideogram",
        code: "EMPTY_RESPONSE",
        provider: "ideogram",
        retryable: false,
      };
    }

    return { results, model: request.model, provider: "ideogram" };
  },
};
