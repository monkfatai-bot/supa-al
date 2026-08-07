/**
 * Supa AI — Grok (xAI) provider.
 *
 * xAI's API is OpenAI-compatible. We point the SDK at `https://api.x.ai/v1`.
 *
 * Server-only.
 *
 * @module @/lib/ai/providers/grok
 */
import { env } from "@/lib/config/env";

import type { AIModel, AIProvider } from "../types";
import { OpenAIProvider } from "./openai";

const DEFAULT_MODEL = "grok-2-latest";

const MODELS: AIModel[] = [
  {
    id: "grok-2-latest",
    provider: "grok",
    label: "Grok 2 (latest)",
    contextWindow: 131_072,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    inputCostCentsPer1K: 2,
    outputCostCentsPer1K: 10,
  },
  {
    id: "grok-2-mini",
    provider: "grok",
    label: "Grok 2 Mini",
    contextWindow: 131_072,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    inputCostCentsPer1K: 0.2,
    outputCostCentsPer1K: 0.5,
  },
  {
    id: "grok-beta",
    provider: "grok",
    label: "Grok Beta",
    contextWindow: 131_072,
    capabilities: { chat: true, streaming: true, tools: false, vision: false, json_mode: false },
    inputCostCentsPer1K: 5,
    outputCostCentsPer1K: 15,
  },
];

export class GrokProvider extends OpenAIProvider {
  override readonly id: AIProvider = "grok";
  protected override defaultModel = DEFAULT_MODEL;

  protected override getConfig(): { apiKey: string; baseURL: string } {
    return {
      apiKey: env.ai.providers.grok.apiKey,
      baseURL: env.ai.providers.grok.baseUrl,
    };
  }

  protected override get catalog(): AIModel[] {
    return MODELS;
  }

  protected override missingKeyError(): Error {
    return new Error("GROK_API_KEY is not set.");
  }
}
