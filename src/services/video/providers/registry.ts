/**
 * Video provider registry.
 * Maps provider IDs to their adapter implementations.
 */

import type { VideoProviderAdapter } from "../types";
import { runwayVideoAdapter } from "./runway-adapter";
import { klingVideoAdapter } from "./kling-adapter";
import { lumaVideoAdapter } from "./luma-adapter";
import { pikaVideoAdapter } from "./pika-adapter";
import { replicateVideoAdapter } from "./replicate-adapter";
import { falVideoAdapter } from "./fal-adapter";
import { googleVideoAdapter } from "./google-video-adapter";
import { openaiVideoAdapter } from "./openai-video-adapter";

const providerMap = new Map<string, VideoProviderAdapter>();

providerMap.set("runway", runwayVideoAdapter);
providerMap.set("kling", klingVideoAdapter);
providerMap.set("luma", lumaVideoAdapter);
providerMap.set("pika", pikaVideoAdapter);
providerMap.set("replicate", replicateVideoAdapter);
providerMap.set("fal", falVideoAdapter);
providerMap.set("google-video", googleVideoAdapter);
providerMap.set("openai-video", openaiVideoAdapter);

/** Get a provider adapter by ID. Throws if not found. */
export function getVideoProvider(providerId: string): VideoProviderAdapter {
  const provider = providerMap.get(providerId);
  if (!provider) {
    throw {
      message: `Unknown video provider: ${providerId}`,
      code: "PROVIDER_NOT_FOUND",
      provider: providerId,
      retryable: false,
    };
  }
  return provider;
}

/** Get all registered providers. */
export function getAllVideoProviders(): VideoProviderAdapter[] {
  return Array.from(providerMap.values());
}
