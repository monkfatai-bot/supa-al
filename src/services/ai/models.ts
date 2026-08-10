/**
 * Central model registry.
 * Each model is tagged with its provider so the
 * correct adapter can be resolved at request time.
 */

import type { AIModelInfo } from "./types";

export const AVAILABLE_MODELS: AIModelInfo[] = [
  // ── OpenAI ──────────────────────────────────────────
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and affordable for everyday tasks",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    costPerRequest: 0.00015,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: true },
    enabled: true,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "High-quality reasoning and complex tasks",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    costPerRequest: 0.005,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: true },
    enabled: true,
  },
  // ── Anthropic Claude ───────────────────────────────
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    description: "Balanced performance and speed",
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    costPerRequest: 0.003,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: false },
    enabled: true,
  },
  {
    id: "claude-haiku-4-20250414",
    name: "Claude Haiku 4",
    provider: "anthropic",
    description: "Fastest Claude model for simple tasks",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    costPerRequest: 0.0008,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: false },
    enabled: true,
  },
  // ── Google Gemini ──────────────────────────────────
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Fast and cost-effective with large context",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    costPerRequest: 0.00015,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: true },
    enabled: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    description: "Most capable Gemini model for complex tasks",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    costPerRequest: 0.00625,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: true },
    enabled: true,
  },
  // ── DeepSeek ────────────────────────────────────────
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    provider: "deepseek",
    description: "Open-source model with strong reasoning",
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    costPerRequest: 0.00014,
    capabilities: { streaming: true, functionCalling: false, vision: false, jsonMode: true },
    enabled: true,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    provider: "deepseek",
    description: "DeepSeek reasoning model",
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    costPerRequest: 0.00055,
    capabilities: { streaming: true, functionCalling: false, vision: false, jsonMode: false },
    enabled: true,
  },
  // ── OpenRouter ──────────────────────────────────────
  {
    id: "openrouter/auto",
    name: "OpenRouter Auto",
    provider: "openrouter",
    description: "Automatic routing to the best model",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    costPerRequest: 0.001,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: true },
    enabled: true,
  },
  {
    id: "anthropic/claude-sonnet-4-20250514",
    name: "Claude Sonnet 4 (Router)",
    provider: "openrouter",
    description: "Claude Sonnet via OpenRouter",
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    costPerRequest: 0.003,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: false },
    enabled: true,
  },
  // ── Qwen ────────────────────────────────────────────
  {
    id: "qwen-turbo",
    name: "Qwen Turbo",
    provider: "qwen",
    description: "Fast multilingual model by Alibaba",
    contextWindow: 1_300_000,
    maxOutputTokens: 8_192,
    costPerRequest: 0.0002,
    capabilities: { streaming: true, functionCalling: true, vision: false, jsonMode: true },
    enabled: true,
  },
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    provider: "qwen",
    description: "Balanced Qwen model for complex tasks",
    contextWindow: 131_072,
    maxOutputTokens: 32_768,
    costPerRequest: 0.0008,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: true },
    enabled: true,
  },
  // ── Grok (xAI) ─────────────────────────────────────
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "grok",
    description: "xAI Grok 3 with real-time knowledge",
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    costPerRequest: 0.003,
    capabilities: { streaming: true, functionCalling: true, vision: true, jsonMode: true },
    enabled: true,
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    provider: "grok",
    description: "Fast and affordable Grok model",
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    costPerRequest: 0.0004,
    capabilities: { streaming: true, functionCalling: true, vision: false, jsonMode: true },
    enabled: true,
  },
];

/** Only models that are enabled. */
export const ENABLED_MODELS = AVAILABLE_MODELS.filter((m) => m.enabled);

/** Get unique providers that have at least one enabled model. */
export function getAvailableProviders(): string[] {
  return [...new Set(ENABLED_MODELS.map((m) => m.provider))];
}

/** Find a model by its ID. Returns undefined if not found. */
export function getModelById(modelId: string): AIModelInfo | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === modelId);
}

/** Get all enabled models for a given provider. */
export function getModelsByProvider(providerId: string): AIModelInfo[] {
  return ENABLED_MODELS.filter((m) => m.provider === providerId);
}

/** Get the default model. */
export function getDefaultModel(): AIModelInfo {
  const first = ENABLED_MODELS[0];
  if (!first) {
    throw new Error("No AI models are enabled");
  }
  return first;
}

/** Resolve the provider ID from a model ID using the registry. */
export function resolveProviderFromModel(modelId: string): string {
  const model = getModelById(modelId);
  if (!model) {
    throw new Error(`Unknown model '${modelId}'`);
  }
  return model.provider;
}
