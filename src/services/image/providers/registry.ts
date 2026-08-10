/**
 * Image provider registry.
 * Maps provider IDs to their adapter implementations.
 */

import type { ImageProviderAdapter } from "../types";
import { openaiImageAdapter } from "./openai-image-adapter";
import { stabilityImageAdapter } from "./stability-adapter";
import { replicateImageAdapter } from "./replicate-adapter";
import { ideogramImageAdapter } from "./ideogram-adapter";
import { falImageAdapter } from "./fal-adapter";
import { googleImageAdapter } from "./google-image-adapter";

const providerMap = new Map<string, ImageProviderAdapter>();

providerMap.set("openai", openaiImageAdapter);
providerMap.set("stability", stabilityImageAdapter);
providerMap.set("replicate", replicateImageAdapter);
providerMap.set("ideogram", ideogramImageAdapter);
providerMap.set("fal", falImageAdapter);
providerMap.set("google-image", googleImageAdapter);

/** Get a provider adapter by ID. Throws if not found. */
export function getImageProvider(providerId: string): ImageProviderAdapter {
  const provider = providerMap.get(providerId);
  if (!provider) {
    throw {
      message: `Unknown image provider: ${providerId}`,
      code: "PROVIDER_NOT_FOUND",
      provider: providerId,
      retryable: false,
    };
  }
  return provider;
}

/** Get all registered providers. */
export function getAllImageProviders(): ImageProviderAdapter[] {
  return Array.from(providerMap.values());
}
