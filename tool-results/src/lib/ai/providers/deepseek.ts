/**
 * Supa AI — DeepSeek provider.
 *
 * DeepSeek is OpenAI-compatible; we point the SDK at its baseURL.
 *
 * Server-only.
 *
 * @module @/lib/ai/providers/deepseek
 */
import { env } from "@/lib/config/env";

import type { AIModel, AIProvider } from "../types";
import { OpenAIProvider } from "./openai";

const DEFAULT_MODEL = "deepseek-chat";

const MODELS: AIModel[] = [
  {
    id: "deepseek-chat",
    provider: "deepseek",
    label: "DeepSeek V3",
    contextWindow: 64_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    inputCostCentsPer1K: 0.27,
    outputCostCentsPer1K: 1.1,
  },
  {
    id: "deepseek-reasoner",
    provider: "deepseek",
    label: "DeepSeek R1 (reasoner)",
    contextWindow: 64_000,
    capabilities: { chat: true, streaming: true, tools: false, vision: false, json_mode: false },
    inputCostCentsPer1K: 0.55,
    outputCostCentsPer1K: 2.19,
  },
];

export class DeepSeekProvider extends OpenAIProvider {
  override readonly id: AIProvider = "deepseek";
  protected override defaultModel = DEFAULT_MODEL;

  protected override getConfig(): { apiKey: string; baseURL: string } {
    return {
      apiKey: env.ai.providers.deepseek.apiKey,
      baseURL: env.ai.providers.deepseek.baseUrl,
    };
  }

  protected override get catalog(): AIModel[] {
    return MODELS;
  }

  protected override missingKeyError(): Error {
    return new Error("DEEPSEEK_API_KEY is not set.");
  }
}
