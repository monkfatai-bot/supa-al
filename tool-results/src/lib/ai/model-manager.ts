/**
 * Supa AI — AI Model Manager.
 *
 * Centralized catalog of all AI models across all providers, with metadata
 * (context window, max output, cost per 1K tokens, capabilities), an
 * enable/disable flag, default-model selection, and automatic fallback
 * ordering.
 *
 * The catalog is the single source of truth for:
 *   - Which models are available to users (UI model picker).
 *   - Cost computation per request (input + output tokens → cents).
 *   - Failover ordering when a provider is unavailable.
 *   - Context-window validation (reject prompts that exceed the limit).
 *
 * Phase 3: the catalog is static (compiled from provider documentation).
 * A future phase can hydrate it from the `ai_models` Supabase table so
 * operators can toggle models without a deploy.
 *
 * @module @/lib/ai/model-manager
 */
import type { AIModel, AIProvider } from "./types";

/**
 * Extended model entry with operator-facing metadata.
 *
 * Extends the provider-agnostic {@link AIModel} with:
 *   - `enabled` — operator toggle.
 *   - `sortOrder` — display order in the model picker.
 *   - `maxOutputTokens` — generation cap.
 *   - `description` — short marketing copy for the picker.
 *   - `tier` — minimum plan required to use this model.
 */
export interface ManagedModel extends AIModel {
  /** Operator toggle — disabled models are hidden from users. */
  enabled: boolean;
  /** Display order in the model picker (lower = first). */
  sortOrder: number;
  /** Max generation tokens. */
  maxOutputTokens: number;
  /** Short description for the picker. */
  description: string;
  /** Minimum subscription plan required. */
  tier: "free" | "starter" | "pro" | "business" | "enterprise";
}

/**
 * The canonical model catalog. Prices are in USD cents per 1K tokens,
 * sourced from each provider's public pricing page.
 *
 * When adding a model, also update the provider's static catalog in
 * `src/lib/ai/providers/<provider>.ts` so `listModels()` stays consistent.
 */
const CATALOG: ManagedModel[] = [
  // --- OpenAI -------------------------------------------------------------
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCostCentsPer1K: 0.15,
    outputCostCentsPer1K: 0.6,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    enabled: true,
    sortOrder: 10,
    description: "Fast, affordable, and capable for everyday tasks.",
    tier: "free",
  },
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCostCentsPer1K: 2.5,
    outputCostCentsPer1K: 10,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    enabled: true,
    sortOrder: 11,
    description: "High-intelligence flagship for complex reasoning.",
    tier: "pro",
  },
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    label: "GPT-4.1 mini",
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    inputCostCentsPer1K: 0.4,
    outputCostCentsPer1K: 1.6,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    enabled: true,
    sortOrder: 12,
    description: "Frontier mini with a 1M context window.",
    tier: "starter",
  },
  {
    id: "o4-mini",
    provider: "openai",
    label: "o4-mini",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    inputCostCentsPer1K: 1.1,
    outputCostCentsPer1K: 4.4,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    enabled: true,
    sortOrder: 13,
    description: "Reasoning model for math, code, and science.",
    tier: "pro",
  },

  // --- Anthropic ----------------------------------------------------------
  {
    id: "claude-3-5-haiku-latest",
    provider: "anthropic",
    label: "Claude 3.5 Haiku",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 0.8,
    outputCostCentsPer1K: 4,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    enabled: true,
    sortOrder: 20,
    description: "Fast, affordable Claude for everyday tasks.",
    tier: "free",
  },
  {
    id: "claude-3-5-sonnet-latest",
    provider: "anthropic",
    label: "Claude 3.5 Sonnet",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 3,
    outputCostCentsPer1K: 15,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    enabled: true,
    sortOrder: 21,
    description: "Best balance of intelligence and speed.",
    tier: "pro",
  },
  {
    id: "claude-3-opus-latest",
    provider: "anthropic",
    label: "Claude 3 Opus",
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    inputCostCentsPer1K: 15,
    outputCostCentsPer1K: 75,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    enabled: true,
    sortOrder: 22,
    description: "Most powerful Claude for complex tasks.",
    tier: "business",
  },

  // --- Google -------------------------------------------------------------
  {
    id: "gemini-2.0-flash",
    provider: "google",
    label: "Gemini 2.0 Flash",
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 0.1,
    outputCostCentsPer1K: 0.4,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    enabled: true,
    sortOrder: 30,
    description: "Fast, versatile, 1M context window.",
    tier: "free",
  },
  {
    id: "gemini-2.0-flash-thinking",
    provider: "google",
    label: "Gemini 2.0 Flash Thinking",
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 0.15,
    outputCostCentsPer1K: 0.6,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    enabled: true,
    sortOrder: 31,
    description: "Reasoning-optimized Gemini variant.",
    tier: "starter",
  },
  {
    id: "gemini-1.5-pro",
    provider: "google",
    label: "Gemini 1.5 Pro",
    contextWindow: 2_000_000,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 1.25,
    outputCostCentsPer1K: 5,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    enabled: true,
    sortOrder: 32,
    description: "2M context — ideal for large documents.",
    tier: "pro",
  },

  // --- OpenRouter (aggregator — exposes many models via one provider) ------
  {
    id: "openrouter/auto",
    provider: "openrouter",
    label: "OpenRouter Auto",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    inputCostCentsPer1K: 0.3,
    outputCostCentsPer1K: 0.9,
    capabilities: { chat: true, streaming: true, tools: false, vision: false, json_mode: false },
    enabled: true,
    sortOrder: 40,
    description: "Auto-routes to the best model for your prompt.",
    tier: "free",
  },

  // --- DeepSeek -----------------------------------------------------------
  {
    id: "deepseek-chat",
    provider: "deepseek",
    label: "DeepSeek V3",
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 0.14,
    outputCostCentsPer1K: 0.28,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    enabled: true,
    sortOrder: 50,
    description: "Cost-effective, strong at coding tasks.",
    tier: "free",
  },
  {
    id: "deepseek-reasoner",
    provider: "deepseek",
    label: "DeepSeek R1",
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 0.55,
    outputCostCentsPer1K: 2.19,
    capabilities: { chat: true, streaming: true, tools: false, vision: false, json_mode: false },
    enabled: true,
    sortOrder: 51,
    description: "Open reasoning model with transparent chain-of-thought.",
    tier: "starter",
  },

  // --- Qwen ---------------------------------------------------------------
  {
    id: "qwen-plus",
    provider: "qwen",
    label: "Qwen Plus",
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 0.4,
    outputCostCentsPer1K: 1.2,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    enabled: true,
    sortOrder: 60,
    description: "Versatile model with strong multilingual support.",
    tier: "free",
  },
  {
    id: "qwen-max",
    provider: "qwen",
    label: "Qwen Max",
    contextWindow: 32_768,
    maxOutputTokens: 8_192,
    inputCostCentsPer1K: 2.4,
    outputCostCentsPer1K: 9.6,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    enabled: true,
    sortOrder: 61,
    description: "Most capable Qwen for complex reasoning.",
    tier: "pro",
  },

  // --- Grok (xAI) ---------------------------------------------------------
  {
    id: "grok-2-latest",
    provider: "grok",
    label: "Grok 2",
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    inputCostCentsPer1K: 2,
    outputCostCentsPer1K: 10,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    enabled: true,
    sortOrder: 70,
    description: "xAI's model with real-time knowledge access.",
    tier: "pro",
  },
  {
    id: "grok-2-mini",
    provider: "grok",
    label: "Grok 2 Mini",
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    inputCostCentsPer1K: 0.2,
    outputCostCentsPer1K: 1,
    capabilities: { chat: true, streaming: true, tools: false, vision: false, json_mode: false },
    enabled: true,
    sortOrder: 71,
    description: "Faster, cheaper Grok variant.",
    tier: "free",
  },
];

/** Models grouped by provider for the UI picker. */
export interface ProviderGroup {
  provider: AIProvider;
  label: string;
  models: ManagedModel[];
}

class ModelManager {
  private catalog: ManagedModel[];

  constructor(catalog: ManagedModel[] = CATALOG) {
    this.catalog = [...catalog].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** All enabled models, sorted by `sortOrder`. */
  listEnabled(): ManagedModel[] {
    return this.catalog.filter((m) => m.enabled);
  }

  /** All models (including disabled), sorted by `sortOrder`. */
  listAll(): ManagedModel[] {
    return [...this.catalog];
  }

  /** Enabled models grouped by provider (for the UI picker). */
  listByProvider(): ProviderGroup[] {
    const groups = new Map<AIProvider, ManagedModel[]>();
    for (const model of this.listEnabled()) {
      const arr = groups.get(model.provider) ?? [];
      arr.push(model);
      groups.set(model.provider, arr);
    }
    return Array.from(groups.entries()).map(([provider, models]) => ({
      provider,
      label: PROVIDER_LABELS[provider] ?? provider,
      models,
    }));
  }

  /** Find a model by provider + model id. Returns `undefined` if not found. */
  find(provider: AIProvider, modelId: string): ManagedModel | undefined {
    return this.catalog.find(
      (m) => m.provider === provider && m.id === modelId,
    );
  }

  /** The default model (first enabled, lowest sortOrder). */
  getDefault(): ManagedModel {
    return this.listEnabled()[0] ?? this.catalog[0];
  }

  /**
   * Compute the cost in USD cents for a request.
   *
   * @param provider - The provider id.
   * @param modelId - The model id.
   * @param inputTokens - Input token count.
   * @param outputTokens - Output token count.
   * @returns Cost in cents (integer, rounded up).
   */
  computeCostCents(
    provider: AIProvider,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    const model = this.find(provider, modelId);
    if (!model) return 0;
    const inputCost =
      (inputTokens / 1000) * (model.inputCostCentsPer1K ?? 0);
    const outputCost =
      (outputTokens / 1000) * (model.outputCostCentsPer1K ?? 0);
    return Math.ceil(inputCost + outputCost);
  }

  /**
   * Validate that a prompt fits within the model's context window.
   *
   * @returns `{ ok: true }` or `{ ok: false, limit, actual }`.
   */
  validateContext(
    provider: AIProvider,
    modelId: string,
    estimatedTokens: number,
  ): { ok: true } | { ok: false; limit: number; actual: number } {
    const model = this.find(provider, modelId);
    if (!model) return { ok: true }; // Unknown model — don't block.
    if (estimatedTokens <= model.contextWindow) return { ok: true };
    return { ok: false, limit: model.contextWindow, actual: estimatedTokens };
  }

  /**
   * Get the failover chain for a model: the preferred model first, then
   * alternatives from the same provider (cheapest first), then alternatives
   * from other providers (cheapest first).
   *
   * Used by the chat service when a provider is unavailable.
   */
  getFailoverChain(provider: AIProvider, modelId: string): ManagedModel[] {
    const preferred = this.find(provider, modelId);
    const chain: ManagedModel[] = [];
    if (preferred && preferred.enabled) chain.push(preferred);

    // Same-provider alternatives (cheapest first, excluding the preferred).
    const sameProvider = this.listEnabled()
      .filter((m) => m.provider === provider && m.id !== modelId)
      .sort(
        (a, b) =>
          (a.inputCostCentsPer1K ?? 0) - (b.inputCostCentsPer1K ?? 0),
      );
    chain.push(...sameProvider);

    // Cross-provider alternatives (cheapest first).
    const crossProvider = this.listEnabled()
      .filter((m) => m.provider !== provider)
      .sort(
        (a, b) =>
          (a.inputCostCentsPer1K ?? 0) - (b.inputCostCentsPer1K ?? 0),
      );
    chain.push(...crossProvider);

    // Deduplicate by `${provider}:${id}`.
    const seen = new Set<string>();
    return chain.filter((m) => {
      const key = `${m.provider}:${m.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

/** Provider display labels (mirrors `@/lib/constants/ai` AI_PROVIDERS). */
const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  grok: "Grok",
};

/** Singleton model manager. */
export const modelManager = new ModelManager();

/** Re-export for tests / custom catalogs. */
export { ModelManager };
