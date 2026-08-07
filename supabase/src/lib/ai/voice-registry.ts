/**
 * Supa AI — Voice provider registry (Phase 8).
 *
 * Maps a voice provider id to a factory, lazy-instantiates the client on
 * first use, and caches the instance per process. `get()` throws
 * `ConfigurationError` when the provider's API key is unset so missing
 * config surfaces as an actionable error rather than a 502 from the
 * upstream SDK.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-registry
 */
import "server-only";

import { env } from "@/lib/config/env";
import { ConfigurationError } from "@/lib/errors";

import type { VoiceProviderId } from "./voice-types";
import type { VoiceProvider } from "./voice-base";
import { OpenAIVoiceProvider } from "./voice-providers/openai";
import { ElevenLabsVoiceProvider } from "./voice-providers/elevenlabs";
import { GoogleVoiceProvider } from "./voice-providers/google";
import { AzureVoiceProvider } from "./voice-providers/azure";
import { DeepgramVoiceProvider } from "./voice-providers/deepgram";
import { AssemblyAIVoiceProvider } from "./voice-providers/assemblyai";
import { CartesiaVoiceProvider } from "./voice-providers/cartesia";
import { PlayHTVoiceProvider } from "./voice-providers/playht";

/** Factory + availability predicate for a voice provider. */
interface VoiceProviderRegistration {
  id: VoiceProviderId;
  factory: () => VoiceProvider;
  /** Returns true when the provider's API key is configured. */
  isConfigured: () => boolean;
  /** Env var name shown in the error message when missing. */
  envVar: string;
}

/** Resolve the OpenAI voice key from the shared chat key by default. */
function resolveOpenAIVoiceKey(): string {
  // Voice is served by the same OpenAI account as chat. We re-use the
  // existing `OPENAI_API_KEY`. A dedicated `OPENAI_VOICE_API_KEY` override
  // is supported when operators want a separate budget.
  return (
    (process.env.OPENAI_VOICE_API_KEY as string | undefined) ?? env.ai.providers.openai.apiKey
  );
}

const REGISTRY: Record<VoiceProviderId, VoiceProviderRegistration> = {
  openai: {
    id: "openai",
    factory: () => new OpenAIVoiceProvider(),
    isConfigured: () => !!resolveOpenAIVoiceKey(),
    envVar: "OPENAI_API_KEY (or OPENAI_VOICE_API_KEY)",
  },
  elevenlabs: {
    id: "elevenlabs",
    factory: () => new ElevenLabsVoiceProvider(),
    isConfigured: () => !!process.env.ELEVENLABS_API_KEY,
    envVar: "ELEVENLABS_API_KEY",
  },
  google: {
    id: "google",
    factory: () => new GoogleVoiceProvider(),
    isConfigured: () => !!process.env.GOOGLE_VOICE_API_KEY || !!env.ai.providers.google.apiKey,
    envVar: "GOOGLE_VOICE_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)",
  },
  azure: {
    id: "azure",
    factory: () => new AzureVoiceProvider(),
    isConfigured: () =>
      !!process.env.AZURE_SPEECH_KEY && !!process.env.AZURE_SPEECH_REGION,
    envVar: "AZURE_SPEECH_KEY + AZURE_SPEECH_REGION",
  },
  deepgram: {
    id: "deepgram",
    factory: () => new DeepgramVoiceProvider(),
    isConfigured: () => !!process.env.DEEPGRAM_API_KEY,
    envVar: "DEEPGRAM_API_KEY",
  },
  assemblyai: {
    id: "assemblyai",
    factory: () => new AssemblyAIVoiceProvider(),
    isConfigured: () => !!process.env.ASSEMBLYAI_API_KEY,
    envVar: "ASSEMBLYAI_API_KEY",
  },
  cartesia: {
    id: "cartesia",
    factory: () => new CartesiaVoiceProvider(),
    isConfigured: () => !!process.env.CARTESIA_API_KEY,
    envVar: "CARTESIA_API_KEY",
  },
  playht: {
    id: "playht",
    factory: () => new PlayHTVoiceProvider(),
    isConfigured: () => !!process.env.PLAYHT_API_KEY && !!process.env.PLAYHT_USER_ID,
    envVar: "PLAYHT_API_KEY + PLAYHT_USER_ID",
  },
};

const VALID_PROVIDERS = Object.keys(REGISTRY) as VoiceProviderId[];

function isProvider(id: string): id is VoiceProviderId {
  return id in REGISTRY;
}

export class VoiceProviderRegistry {
  private instances = new Map<VoiceProviderId, VoiceProvider>();

  /** Get a voice provider client (lazy-init, cached). Throws ConfigurationError when unset. */
  get(providerId: string): VoiceProvider {
    if (!isProvider(providerId)) {
      throw new ConfigurationError(
        `Unknown voice provider: "${providerId}". Valid: ${VALID_PROVIDERS.join(", ")}.`,
      );
    }
    const reg = REGISTRY[providerId];
    if (!reg.isConfigured()) {
      throw new ConfigurationError(
        `Voice provider "${providerId}" requires ${reg.envVar} to be set.`,
        { provider: providerId, envVar: reg.envVar },
      );
    }
    let instance = this.instances.get(providerId);
    if (!instance) {
      instance = reg.factory();
      this.instances.set(providerId, instance);
    }
    return instance;
  }

  /** Providers with their API key configured. */
  listAvailable(): VoiceProviderId[] {
    return VALID_PROVIDERS.filter((id) => REGISTRY[id].isConfigured());
  }

  /** All known provider ids. */
  listAll(): VoiceProviderId[] {
    return [...VALID_PROVIDERS];
  }

  /** Whether the given provider is configured. */
  isConfigured(providerId: string): boolean {
    return isProvider(providerId) ? REGISTRY[providerId].isConfigured() : false;
  }
}

/** Shared singleton. */
export const voiceRegistry = new VoiceProviderRegistry();
