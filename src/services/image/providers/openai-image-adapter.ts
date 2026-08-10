/**
 * OpenAI image provider adapter.
 * Supports DALL-E 3 and GPT Image.
 * All API keys stay server-side.
 */

import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModelInfo,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";

const MODELS: ImageModelInfo[] = [
  {
    id: "gpt-image-1",
    name: "GPT Image",
    provider: "openai",
    description: "OpenAI's latest image generation model with excellent prompt understanding",
    supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    supportedGenerationTypes: ["text-to-image", "image-to-image"],
    creditCost: 5,
    maxResolution: "1792x1792",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsGuidanceScale: false,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 1,
    enabled: true,
  },
  {
    id: "dall-e-3",
    name: "DALL-E 3",
    provider: "openai",
    description: "High-quality image generation with strong prompt adherence",
    supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
    supportedAspectRatios: ["1:1"],
    supportedGenerationTypes: ["text-to-image"],
    creditCost: 4,
    maxResolution: "1792x1792",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsGuidanceScale: false,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 1,
    enabled: true,
  },
];

export const openaiImageAdapter: ImageProviderAdapter = {
  providerId: "openai",
  displayName: "OpenAI",

  getAvailableModels() {
    return MODELS;
  },

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw {
        message: "OpenAI API key is not configured. Please set OPENAI_API_KEY in your environment.",
        code: "PROVIDER_NOT_CONFIGURED",
        provider: "openai",
        statusCode: 500,
        retryable: false,
      };
    }

    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
      n: request.settings.numImages,
      size: request.settings.size,
      quality: request.settings.quality,
      response_format: "b64_json",
    };

    // DALL-E 3 supports the style parameter
    if (request.model === "dall-e-3") {
      body.style = request.settings.style;
    }

    logger.debug("OpenAI image request", {
      model: request.model,
      size: request.settings.size,
      quality: request.settings.quality,
    });

    const response = await fetch(OPENAI_IMAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      logger.error("OpenAI Image API error", {
        status: response.status,
        body: errorBody,
        model: request.model,
      });

      throw {
        message: `OpenAI Image API returned ${response.status}: ${errorBody}`,
        code: "PROVIDER_API_ERROR",
        provider: "openai",
        statusCode: response.status,
        retryable: response.status >= 500,
      };
    }

    const data = (await response.json()) as {
      data: Array<{ b64_json?: string; revised_prompt?: string }>; };

    const results = (data.data ?? []).map((item) => ({
      imageData: item.b64_json ?? "",
      revisedPrompt: item.revised_prompt,
    }));

    if (results.length === 0 || !results[0].imageData) {
      throw {
        message: "No image data returned from OpenAI",
        code: "EMPTY_RESPONSE",
        provider: "openai",
        retryable: false,
      };
    }

    logger.debug("OpenAI image response received", {
      model: request.model,
      resultCount: results.length,
    });

    return {
      results,
      model: request.model,
      provider: "openai",
    };
  },
};
