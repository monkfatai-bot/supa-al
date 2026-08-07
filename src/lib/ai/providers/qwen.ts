/**
 * Supa AI — Qwen (DashScope) provider.
 *
 * DashScope's OpenAI-compatible endpoint at
 * `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.
 *
 * Server-only.
 *
 * @module @/lib/ai/providers/qwen
 */
import { env } from "@/lib/config/env";

import type { AIModel, AIProvider } from "../types";
import { OpenAIProvider } from "./openai";

const DEFAULT_MODEL = "qwen-plus";

const MODELS: AIModel[] = [
  {
    id: "qwen-turbo",
    provider: "qwen",
    label: "Qwen Turbo",
    contextWindow: 128_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    inputCostCentsPer1K: 0.05,
    outputCostCentsPer1K: 0.2,
  },
  {
    id: "qwen-plus",
    provider: "qwen",
    label: "Qwen Plus",
    contextWindow: 128_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    inputCostCentsPer1K: 0.4,
    outputCostCentsPer1K: 1.2,
  },
  {
    id: "qwen-max",
    provider: "qwen",
    label: "Qwen Max",
    contextWindow: 32_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: false, json_mode: true },
    inputCostCentsPer1K: 2.4,
    outputCostCentsPer1K: 9.6,
  },
];

export class QwenProvider extends OpenAIProvider {
  override readonly id: AIProvider = "qwen";
  protected override defaultModel = DEFAULT_MODEL;

  protected override getConfig(): { apiKey: string; baseURL: string } {
    return {
      apiKey: env.ai.providers.qwen.apiKey,
      baseURL: env.ai.providers.qwen.baseUrl,
    };
  }

  protected override get catalog(): AIModel[] {
    return MODELS;
  }

  protected override missingKeyError(): Error {
    return new Error("QWEN_API_KEY is not set.");
  }
}
