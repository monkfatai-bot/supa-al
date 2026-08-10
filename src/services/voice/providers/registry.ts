/**
 * Voice provider registry.
 * Maps provider IDs to their adapter implementations.
 */

import type { VoiceProviderAdapter } from "../types";
import { openaiVoiceAdapter } from "./openai-voice-adapter";
import { elevenlabsVoiceAdapter } from "./elevenlabs-adapter";
import { googleVoiceAdapter } from "./google-voice-adapter";
import { azureVoiceAdapter } from "./azure-voice-adapter";
import { deepgramVoiceAdapter } from "./deepgram-adapter";
import { assemblyaiVoiceAdapter } from "./assemblyai-adapter";
import { cartesiaVoiceAdapter } from "./cartesia-adapter";
import { playhtVoiceAdapter } from "./playht-adapter";

const providerMap = new Map<string, VoiceProviderAdapter>();

providerMap.set("openai-voice", openaiVoiceAdapter);
providerMap.set("elevenlabs", elevenlabsVoiceAdapter);
providerMap.set("google-voice", googleVoiceAdapter);
providerMap.set("azure-voice", azureVoiceAdapter);
providerMap.set("deepgram", deepgramVoiceAdapter);
providerMap.set("assemblyai", assemblyaiVoiceAdapter);
providerMap.set("cartesia", cartesiaVoiceAdapter);
providerMap.set("playht", playhtVoiceAdapter);

/** Get a provider adapter by ID. Throws if not found. */
export function getVoiceProvider(providerId: string): VoiceProviderAdapter {
  const provider = providerMap.get(providerId);
  if (!provider) {
    throw {
      message: `Unknown voice provider: ${providerId}`,
      code: "PROVIDER_NOT_FOUND",
      provider: providerId,
      retryable: false,
    };
  }
  return provider;
}

/** Get all registered providers. */
export function getAllVoiceProviders(): VoiceProviderAdapter[] {
  return Array.from(providerMap.values());
}
