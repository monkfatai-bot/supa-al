/**
 * Supa AI — AI provider registry.
 *
 * Maps a provider id to a factory, lazy-instantiates the client on first use,
 * and caches the instance per process. `get()` throws `ConfigurationError`
 * when the provider's API key is unset so missing config surfaces as an
 * actionable error rather than a 502 from the upstream SDK.
 *
 * Server-only.
 *
 * @module @/lib/ai/registry
 */
import { env } from "@/lib/config/env";
import { ConfigurationError } from "@/lib/errors";

import type { AIProvider } from "./types";
import type { AIProviderClient } from "./provider";
import { AnthropicProvider } from "./providers/anthropic";
import { DeepSeekProvider } from "./providers/deepseek";
import { GoogleProvider } from "./providers/google";
import { GrokProvider } from "./providers/grok";
import { OpenAIProvider } from "./providers/openai";
import { OpenRouterProvider } from "./providers/openrouter";
import { QwenProvider } from "./providers/qwen";

/** Factory + availability predicate for a provider. */
interface ProviderRegistration {
  id: AIProvider;
  factory: () => AIProviderClient;
  /** Returns true when the provider's API key is configured. */
  isConfigured: () => boolean;
  /** Env var name shown in the error message when missing. */
  envVar: string;
}

const REGISTRY: Record<AIProvider, ProviderRegistration> = {
  openai: {
    id: "openai",
    factory: () => new OpenAIProvider(),
    isConfigured: () => !!env.ai.providers.openai.apiKey,
    envVar: "OPENAI_API_KEY",
  },
  anthropic: {
    id: "anthropic",
    factory: () => new AnthropicProvider(),
    isConfigured: () => !!env.ai.providers.anthropic.apiKey,
    envVar: "ANTHROPIC_API_KEY",
  },
  google: {
    id: "google",
    factory: () => new GoogleProvider(),
    isConfigured: () => !!env.ai.providers.google.apiKey,
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
  },
  openrouter: {
    id: "openrouter",
    factory: () => new OpenRouterProvider(),
    isConfigured: () => !!env.ai.providers.openrouter.apiKey,
    envVar: "OPENROUTER_API_KEY",
  },
  deepseek: {
    id: "deepseek",
    factory: () => new DeepSeekProvider(),
    isConfigured: () => !!env.ai.providers.deepseek.apiKey,
    envVar: "DEEPSEEK_API_KEY",
  },
  qwen: {
    id: "qwen",
    factory: () => new QwenProvider(),
    isConfigured: () => !!env.ai.providers.qwen.apiKey,
    envVar: "QWEN_API_KEY",
  },
  grok: {
    id: "grok",
    factory: () => new GrokProvider(),
    isConfigured: () => !!env.ai.providers.grok.apiKey,
    envVar: "GROK_API_KEY",
  },
};

const VALID_PROVIDERS = Object.keys(REGISTRY) as AIProvider[];

function isProvider(id: string): id is AIProvider {
  return id in REGISTRY;
}

export class AIProviderRegistry {
  private instances = new Map<AIProvider, AIProviderClient>();

  /**
   * Get a provider client (lazy-init, cached). Throws `ConfigurationError`
   * when the provider's API key is unset.
   */
  get(providerId: string): AIProviderClient {
    if (!isProvider(providerId)) {
      throw new ConfigurationError(
        `Unknown AI provider: "${providerId}". Valid: ${VALID_PROVIDERS.join(", ")}.`,
      );
    }
    const reg = REGISTRY[providerId];
    if (!reg.isConfigured()) {
      throw new ConfigurationError(
        `AI provider "${providerId}" requires ${reg.envVar} to be set.`,
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

  /** Get the configured default provider. */
  getDefault(): AIProviderClient {
    return this.get(env.ai.defaultProvider);
  }

  /** Default provider id (validated to be a known provider). */
  getDefaultId(): AIProvider {
    return isProvider(env.ai.defaultProvider)
      ? env.ai.defaultProvider
      : "openai";
  }

  /**
   * Providers with their API key configured. Used by the dashboard to show
   * only the providers the operator has wired up.
   */
  listAvailable(): AIProvider[] {
    return VALID_PROVIDERS.filter((id) => REGISTRY[id].isConfigured());
  }

  /** All known provider ids. */
  listAll(): AIProvider[] {
    return [...VALID_PROVIDERS];
  }
}

/** Shared singleton. */
export const aiRegistry = new AIProviderRegistry();
