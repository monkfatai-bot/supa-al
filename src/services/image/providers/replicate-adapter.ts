/**
 * Replicate image provider adapter.
 * Supports Flux, Realistic Vision, Juggernaut XL and other Replicate-hosted models.
 */

import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModelInfo,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

const REPLICATE_API_URL = "https://api.replicate.com/v1/predictions";

const REPLICATE_MODELS: Record<string, string> = {
  "flux-pro": "black-forest-labs/flux-pro",
  "flux-schnell": "black-forest-labs/flux-schnell",
  "flux-dev": "black-forest-labs/flux-dev",
  "realistic-vision-v6": "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
  "juggernaut-xl": "lucataco/juggernaut-xl-v9:058b07382c557f8ac5e4f5ce7b5e00e00c8e1e83b4b6e0e48e1e83b4b6e0e48e1",
};

const MODELS: ImageModelInfo[] = [
  {
    id: "flux-pro",
    name: "Flux Pro",
    provider: "replicate",
    description: "Black Forest Labs Flux Pro — highest quality open model",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536", "2048x2048"],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    supportedGenerationTypes: ["text-to-image", "image-to-image"],
    creditCost: 5,
    maxResolution: "2048x2048",
    quality: "ultra",
    speed: "slow",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsSteps: true,
    supportsStrength: true,
    maxNumImages: 4,
    enabled: true,
  },
  {
    id: "flux-schnell",
    name: "Flux Schnell",
    provider: "replicate",
    description: "Black Forest Labs Flux Schnell — fast generation mode",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536", "2048x2048"],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    supportedGenerationTypes: ["text-to-image"],
    creditCost: 2,
    maxResolution: "2048x2048",
    quality: "medium",
    speed: "fast",
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsGuidanceScale: false,
    supportsSteps: false,
    supportsStrength: false,
    maxNumImages: 4,
    enabled: true,
  },
  {
    id: "flux-dev",
    name: "Flux Dev",
    provider: "replicate",
    description: "Black Forest Labs Flux Dev — balanced quality and speed",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536", "2048x2048"],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    supportedGenerationTypes: ["text-to-image", "image-to-image"],
    creditCost: 3,
    maxResolution: "2048x2048",
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
    id: "realistic-vision-v6",
    name: "Realistic Vision",
    provider: "replicate",
    description: "Photorealistic image generation model",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    supportedGenerationTypes: ["text-to-image", "image-to-image"],
    creditCost: 2,
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
    id: "juggernaut-xl",
    name: "Juggernaut XL",
    provider: "replicate",
    description: "Highly detailed realistic photography model",
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    supportedGenerationTypes: ["text-to-image", "image-to-image"],
    creditCost: 2,
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
];

function getApiKey(): string {
  if (!env.REPLICATE_API_KEY) {
    throw {
      message: "Replicate API key is not configured. Please set REPLICATE_API_KEY.",
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "replicate",
      statusCode: 500,
      retryable: false,
    };
  }
  return env.REPLICATE_API_KEY;
}

function getReplicateModelVersion(modelId: string): string {
  const version = REPLICATE_MODELS[modelId];
  if (!version) throw new Error(`Unknown Replicate model: ${modelId}`);
  return version;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForResult(predictionUrl: string, token: string): Promise<{ output: string[] | null; error: string | null }> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const resp = await fetch(predictionUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) continue;
    const data = (await resp.json()) as { status: string; output?: string[]; error?: string };
    if (data.status === "succeeded" && data.output) return { output: data.output, error: null };
    if (data.status === "failed") return { output: null, error: data.error ?? "Prediction failed" };
    if (data.status === "canceled") return { output: null, error: "Prediction was cancelled" };
  }
  return { output: null, error: "Prediction timed out" };
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image from ${url}`);
  const buffer = await resp.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

export const replicateImageAdapter: ImageProviderAdapter = {
  providerId: "replicate",
  displayName: "Replicate",

  getAvailableModels() {
    return MODELS;
  },

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const token = getApiKey();
    const version = getReplicateModelVersion(request.model);

    const input: Record<string, unknown> = {
      prompt: request.prompt,
    };
    if (request.negativePrompt) input.negative_prompt = request.negativePrompt;
    if (request.settings.seed !== undefined) input.seed = request.settings.seed;
    if (request.settings.guidanceScale !== undefined) input.guidance_scale = request.settings.guidanceScale;
    if (request.settings.steps !== undefined) input.num_inference_steps = request.settings.steps;
    if (request.settings.numImages > 1) input.num_outputs = request.settings.numImages;

    const [w, h] = request.settings.size.split("x").map(Number);
    input.width = w;
    input.height = h;

    if (request.sourceImageBase64) {
      input.image = `data:image/png;base64,${request.sourceImageBase64}`;
      if (request.settings.strength !== undefined) input.prompt_strength = request.settings.strength;
    }

    logger.debug("Replicate image request", { model: request.model, size: request.settings.size });

    const createResp = await fetch(REPLICATE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ version, input }),
    });

    if (!createResp.ok) {
      const errorBody = await createResp.text().catch(() => "Unknown error");
      logger.error("Replicate API error", { status: createResp.status, body: errorBody });
      throw {
        message: `Replicate API returned ${createResp.status}: ${errorBody}`,
        code: "PROVIDER_API_ERROR",
        provider: "replicate",
        statusCode: createResp.status,
        retryable: createResp.status >= 500,
      };
    }

    const prediction = (await createResp.json()) as {
      status: string;
      output?: string[];
      urls?: { get: string };
      error?: string;
    };

    let outputUrls: string[] | null = null;
    let error: string | null = null;

    if (prediction.status === "succeeded" && prediction.output) {
      outputUrls = prediction.output;
    } else if (prediction.status === "failed" || prediction.status === "canceled") {
      error = prediction.error ?? `Prediction ${prediction.status}`;
    } else if (prediction.urls?.get) {
      const result = await pollForResult(prediction.urls.get, token);
      outputUrls = result.output;
      error = result.error;
    } else if (prediction.output) {
      outputUrls = prediction.output;
    } else {
      error = `Unexpected prediction status: ${prediction.status}`;
    }

    if (error || !outputUrls || outputUrls.length === 0) {
      throw {
        message: error ?? "Replicate returned no image output",
        code: "PROVIDER_API_ERROR",
        provider: "replicate",
        retryable: false,
      };
    }

    const results = await Promise.all(outputUrls.map(fetchImageAsBase64));

    return {
      results: results.map((imageData) => ({ imageData })),
      model: request.model,
      provider: "replicate",
    };
  },
};
