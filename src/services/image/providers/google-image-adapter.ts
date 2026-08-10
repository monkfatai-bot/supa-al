/**
 * Google Gemini Image provider adapter.
 * Uses the Gemini API's image generation capabilities.
 */

import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModelInfo,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

const MODELS: ImageModelInfo[] = [
  {
    id: "gemini-image",
    name: "Gemini Image",
    provider: "google-image",
    description: "Google Gemini image generation capabilities",
    supportedSizes: ["1024x1024"],
    supportedAspectRatios: ["1:1"],
    supportedGenerationTypes: ["text-to-image"],
    creditCost: 3,
    maxResolution: "1024x1024",
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

function getApiKey(): string {
  if (!env.GOOGLE_AI_API_KEY) {
    throw {
      message: "Google AI API key is not configured. Please set GOOGLE_AI_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "google-image",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.GOOGLE_AI_API_KEY;
}

export const googleImageAdapter: ImageProviderAdapter = {
  providerId: "google-image",
  displayName: "Google Gemini",

  getAvailableModels() {
    return MODELS;
  },

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const apiKey = getApiKey();

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `Generate an image based on the following description. Output only the image without any text overlay: ${request.prompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "image/png",
      },
    };

    logger.debug("Google Gemini image request", { model: request.model });

    const url = `${GEMINI_IMAGE_URL}?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      logger.error("Google Gemini Image API error", {
        status: response.status,
        body: errorBody,
      });
      throw {
        message: `Google Gemini API returned ${response.status}: ${errorBody}`,
        code: "PROVIDER_API_ERROR",
        provider: "google-image",
        statusCode: response.status,
        retryable: response.status >= 500,
      };
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };

    const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!inlineData?.data) {
      throw {
        message: "No image data returned from Google Gemini",
        code: "EMPTY_RESPONSE",
        provider: "google-image",
        retryable: false,
      };
    }

    return {
      results: [{ imageData: inlineData.data }],
      model: request.model,
      provider: "google-image",
    };
  },
};
