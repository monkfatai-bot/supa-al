/**
 * Supa AI — OpenRouter provider.
 *
 * OpenRouter is OpenAI-compatible — we just point the SDK at its baseURL
 * and pass its API key. Routes through hundreds of underlying models.
 *
 * Server-only.
 *
 * @module @/lib/ai/providers/openrouter
 */
import { env } from "@/lib/config/env";

import type { AIModel, AIProvider } from "../types";
import { OpenAIProvider } from "./openai";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const MODELS: AIModel[] = [
  {
    id: "openai/gpt-4o-mini",
    provider: "openrouter",
    label: "GPT-4o mini (via OpenRouter)",
    contextWindow: 128_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 0.15,
    outputCostCentsPer1K: 0.6,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    provider: "openrouter",
    label: "Claude 3.5 Sonnet (via OpenRouter)",
    contextWindow: 200_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 3,
    outputCostCentsPer1K: 15,
  },
  {
    id: "google/gemini-flash-1.5",
    provider: "openrouter",
    label: "Gemini Flash 1.5 (via OpenRouter)",
    contextWindow: 1_000_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 0.075,
    outputCostCentsPer1K: 0.3,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    provider: "openrouter",
    label: "Llama 3.3 70B (via OpenRouter)",
    contextWindow: 128_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    inputCostCentsPer1K: 0.23,
    outputCostCentsPer1K: 0.4,
  },
];

export class OpenRouterProvider extends OpenAIProvider {
  override readonly id: AIProvider = "openrouter";
  protected override defaultModel = DEFAULT_MODEL;

  protected override getConfig(): { apiKey: string; baseURL: string } {
    return {
      apiKey: env.ai.providers.openrouter.apiKey,
      baseURL: env.ai.providers.openrouter.baseUrl,
    };
  }

  protected override get catalog(): AIModel[] {
    return MODELS;
  }

  protected override missingKeyError(): Error {
    return new Error("OPENROUTER_API_KEY is not set.");
  }
}
