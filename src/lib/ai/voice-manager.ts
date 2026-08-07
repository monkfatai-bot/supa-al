/**
 * Supa AI — Voice provider manager (Phase 8).
 *
 * Top-level facade over the voice provider registry. Picks the default
 * provider, lists available providers + their catalogs, and resolves a
 * provider by id. Concrete providers are lazy-instantiated + cached by
 * {@link voiceRegistry}.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-manager
 */
import "server-only";

import type { VoiceModelInfo, VoiceProviderId } from "./voice-types";
import { voiceRegistry } from "./voice-registry";

/** Default voice provider when no override is given. */
export const DEFAULT_VOICE_PROVIDER: VoiceProviderId = "openai";

/**
 * Voice provider manager — single entry point for application code.
 * Use {@link voiceManager.getProvider} to obtain a provider client and
 * call its methods directly, or use the higher-level orchestration in
 * `src/lib/voice/voice-service.ts`.
 */
class VoiceManager {
  /** Resolve a provider client by id (default when omitted). */
  getProvider(id?: VoiceProviderId) {
    return voiceRegistry.get(id ?? DEFAULT_VOICE_PROVIDER);
  }

  /** Default provider id (always OpenAI today). */
  getDefaultProviderId(): VoiceProviderId {
    return DEFAULT_VOICE_PROVIDER;
  }

  /** List providers that have their API key configured. */
  listAvailable(): VoiceProviderId[] {
    return voiceRegistry.listAvailable();
  }

  /** All known provider ids (configured or not). */
  listAll(): VoiceProviderId[] {
    return voiceRegistry.listAll();
  }

  /** Whether the given provider has its API key configured. */
  isConfigured(providerId: string): boolean {
    return voiceRegistry.isConfigured(providerId);
  }

  /**
   * Aggregate catalog: every model from every configured provider,
   * grouped by provider id. The UI renders this flat list grouped.
   */
  async listModels(): Promise<VoiceModelInfo[]> {
    const available = this.listAvailable();
    const results = await Promise.all(
      available.map((id) =>
        voiceRegistry
          .get(id)
          .listModels()
          .catch(() => [] as VoiceModelInfo[]),
      ),
    );
    return results.flat();
  }

  /** List models for a single provider (configured or not — configured only). */
  async listModelsFor(providerId: VoiceProviderId): Promise<VoiceModelInfo[]> {
    if (!voiceRegistry.isConfigured(providerId)) return [];
    return voiceRegistry.get(providerId).listModels();
  }
}

/** Shared singleton. */
export const voiceManager = new VoiceManager();
