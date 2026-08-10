import {
  openaiAdapter,
} from "./providers/openai-adapter";
import { anthropicAdapter } from "./providers/anthropic-adapter";
import { googleAdapter } from "./providers/google-adapter";
import { deepseekAdapter } from "./providers/deepseek-adapter";
import { openrouterAdapter } from "./providers/openrouter-adapter";
import { qwenAdapter } from "./providers/qwen-adapter";
import { grokAdapter } from "./providers/grok-adapter";
import type { AIProviderAdapter } from "./types";

const providerMap = new Map<string, AIProviderAdapter>([
  [openaiAdapter.providerId, openaiAdapter],
  [anthropicAdapter.providerId, anthropicAdapter],
  [googleAdapter.providerId, googleAdapter],
  [deepseekAdapter.providerId, deepseekAdapter],
  [openrouterAdapter.providerId, openrouterAdapter],
  [qwenAdapter.providerId, qwenAdapter],
  [grokAdapter.providerId, grokAdapter],
]);

/** Get an adapter by provider ID. Throws if not found. */
export function getProvider(providerId: string): AIProviderAdapter {
  const provider = providerMap.get(providerId);
  if (!provider) {
    throw {
      message: `AI provider '${providerId}' is not configured`,
      code: "PROVIDER_NOT_FOUND",
      provider: providerId,
      retryable: false,
    };
  }
  return provider;
}

/** Get all registered provider adapters. */
export function getAllProviders(): AIProviderAdapter[] {
  return Array.from(providerMap.values());
}
