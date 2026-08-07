/**
 * Supa AI — AI provider constants.
 *
 * Static catalog of supported AI providers (OpenAI, Anthropic, Google,
 * OpenRouter, DeepSeek, Qwen, Grok) and their advertised capabilities.
 * Runtime credentials live in `env.ai.providers` — this module only
 * describes the catalog (labels, docs URLs, capability matrix) so the UI
 * can render provider pickers and so feature flags can gate on capability.
 *
 * @module @/lib/constants/ai
 */

/** Provider identifiers. Keep in sync with `env.ai.providers` keys. */
export type AiProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "deepseek"
  | "qwen"
  | "grok";

/** Capability flags a provider may expose. */
export type AiCapability =
  | "text"
  | "vision"
  | "function-calling"
  | "streaming";

/** Static metadata for a single provider. */
export interface AiProviderInfo {
  /** Stable provider id used in DB / API surfaces. */
  id: AiProviderId;
  /** Human-readable label for UI. */
  label: string;
  /** Public docs URL for the provider's API. */
  docsUrl: string;
  /** Whether an API key must be supplied to use this provider. */
  requiresKey: boolean;
}

/**
 * Catalog of supported AI providers. Order is significant for UI selectors.
 */
export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    docsUrl: "https://platform.openai.com/docs",
    requiresKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    docsUrl: "https://docs.anthropic.com",
    requiresKey: true,
  },
  {
    id: "google",
    label: "Google AI",
    docsUrl: "https://ai.google.dev/docs",
    requiresKey: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    docsUrl: "https://openrouter.ai/docs",
    requiresKey: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    docsUrl: "https://api-docs.deepseek.com",
    requiresKey: true,
  },
  {
    id: "qwen",
    label: "Qwen (Alibaba)",
    docsUrl: "https://help.aliyun.com/zh/dashscope",
    requiresKey: true,
  },
  {
    id: "grok",
    label: "Grok (xAI)",
    docsUrl: "https://docs.x.ai",
    requiresKey: true,
  },
] as const;

/** Default provider id when none is specified. Mirrors `env.ai.defaultProvider`. */
export const DEFAULT_AI_PROVIDER: AiProviderId = "openai";

/** Default model id when none is specified. Mirrors `env.ai.defaultModel`. */
export const DEFAULT_AI_MODEL = "gpt-4o-mini" as const;

/**
 * Capability matrix. `true` means the provider exposes the capability via
 * its API today; absence means we either haven't integrated it yet or the
 * provider does not support it.
 */
export const AI_CAPABILITIES: Readonly<
  Record<AiProviderId, ReadonlyArray<AiCapability>>
> = {
  openai: ["text", "vision", "function-calling", "streaming"],
  anthropic: ["text", "vision", "function-calling", "streaming"],
  google: ["text", "vision", "function-calling", "streaming"],
  openrouter: ["text", "vision", "function-calling", "streaming"],
  deepseek: ["text", "function-calling", "streaming"],
  qwen: ["text", "vision", "function-calling", "streaming"],
  grok: ["text", "function-calling", "streaming"],
} as const;

/**
 * Type guard: does `provider` advertise `capability`?
 */
export function providerSupports(
  provider: AiProviderId,
  capability: AiCapability,
): boolean {
  return AI_CAPABILITIES[provider]?.includes(capability) ?? false;
}
