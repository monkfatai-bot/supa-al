/**
 * Stability AI (SDXL) image provider adapter.
 * Uses the official Stability API.
 */

import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModelInfo,
  ImageEditRequest,
  ImageEditResponse,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

const STABILITY_API_URL = "https://api.stability.ai/v2beta/stable-image/generate/sdxl";
const STABILITY_UPSCALE_URL = "https://api.stability.ai/v2beta/stable-image/upscale/conservative-upscale";
const STABILITY_BG_REMOVE_URL = "https://api.stability.ai/v2beta/stable-image/edit/remove-background";

const MODELS: ImageModelInfo[] = [
  {
    id: "stable-diffusion-xl-1.0",
    name: "SDXL 1.0",
    provider: "stability",
    description: "Stable Diffusion XL — high-quality open model",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    supportedGenerationTypes: ["text-to-image", "image-to-image"],
    creditCost: 3,
    maxResolution: "1536x1536",
    quality: "high",
    speed: "medium",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },
  {
    id: "stable-diffusion-xl-0.9",
    name: "SDXL 0.9",
    provider: "stability",
    description: "Previous generation Stable Diffusion XL",
    supportedSizes: ["1024x1024"],
    supportedAspectRatios: ["1:1"],
    supportedGenerationTypes: ["text-to-image", "image-to-image"],
    creditCost: 2,
    maxResolution: "1024x1024",
    quality: "medium",
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
  if (!env.STABILITY_API_KEY) {
    throw {
      message: "Stability AI API key is not configured. Please set STABILITY_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "stability",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.STABILITY_API_KEY;
}

export const stabilityImageAdapter: ImageProviderAdapter = {
  providerId: "stability",
  displayName: "Stability AI",

  getAvailableModels() {
    return MODELS;
  },

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const apiKey = getApiKey();

    const formData = new FormData();
    formData.append("prompt", request.prompt);
    if (request.negativePrompt) {
      formData.append("negative_prompt", request.negativePrompt);
    }
    formData.append("output_format", "png");

    const [w, h] = request.settings.size.split("x").map(Number);
    formData.append("width", String(w));
    formData.append("height", String(h));

    if (request.settings.seed !== undefined) {
      formData.append("seed", String(request.settings.seed));
    }
    if (request.settings.guidanceScale !== undefined) {
      formData.append("guidance_scale", String(request.settings.guidanceScale));
    }
    if (request.settings.steps !== undefined) {
      formData.append("steps", String(request.settings.steps));
    }

    // Image-to-image
    if (request.sourceImageBase64 && request.settings.strength !== undefined) {
      formData.append("image", request.sourceImageBase64);
      formData.append("strength", String(request.settings.strength));
    }

    logger.debug("Stability AI image request", {
      model: request.model,
      size: request.settings.size,
    });

    const response = await fetch(STABILITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "image/*",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      logger.error("Stability AI API error", { status: response.status, body: errorBody });
      throw {
        message: `Stability AI API returned ${response.status}: ${errorBody}`,
        code: "PROVIDER_API_ERROR",
        provider: "stability",
        statusCode: response.status,
        retryable: response.status >= 500,
      };
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return {
      results: [{ imageData: base64 }],
      model: request.model,
      provider: "stability",
    };
  },

  async editImage(request: ImageEditRequest): Promise<ImageEditResponse> {
    const apiKey = getApiKey();

    let url: string;
    const formData = new FormData();
    formData.append("image", request.imageBase64);
    formData.append("output_format", "png");

    switch (request.operation) {
      case "background-removal":
        url = STABILITY_BG_REMOVE_URL;
        break;
      case "upscaling":
        url = STABILITY_UPSCALE_URL;
        break;
      default:
        throw {
          message: `Stability AI does not support operation: ${request.operation}`,
          code: "UNSUPPORTED_OPERATION",
          provider: "stability",
          retryable: false,
        };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "image/*",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw {
        message: `Stability AI edit API returned ${response.status}: ${errorBody}`,
        code: "PROVIDER_API_ERROR",
        provider: "stability",
        statusCode: response.status,
        retryable: response.status >= 500,
      };
    }

    const buffer = await response.arrayBuffer();
    return {
      imageData: Buffer.from(buffer).toString("base64"),
      operation: request.operation,
      provider: "stability",
    };
  },
};
