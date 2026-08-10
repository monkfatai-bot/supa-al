/**
 * OpenRouter provider adapter.
 * Routes requests through OpenRouter's unified API.
 */

import type {
  AIProviderAdapter,
  AIRequestConfig,
  AIResponse,
  AIStreamChunk,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";
import { getModelsByProvider } from "../models";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const openrouterAdapter: AIProviderAdapter = {
  providerId: "openrouter",
  displayName: "OpenRouter",

  getAvailableModels() {
    return getModelsByProvider("openrouter");
  },

  async chatCompletion(request: AIRequestConfig): Promise<AIResponse> {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw {
        message: "OpenRouter API key is not configured. Set OPENROUTER_API_KEY in your environment.",
        code: "PROVIDER_NOT_CONFIGURED",
        provider: "openrouter",
        statusCode: 500,
        retryable: false,
      };
    }

    const body = {
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    };

    logger.debug("OpenRouter request", { model: request.model, messageCount: request.messages.length });

    // Build headers object, filtering out undefined values
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    // Add optional headers only if they're defined
    if (env.NEXT_PUBLIC_APP_URL) {
      headers["HTTP-Referer"] = env.NEXT_PUBLIC_APP_URL;
    }
    if (env.NEXT_PUBLIC_APP_NAME) {
      headers["X-Title"] = env.NEXT_PUBLIC_APP_NAME;
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      const retryable = response.status === 429 || response.status >= 500;
      logger.error("OpenRouter API error", { status: response.status, body: errorBody, model: request.model });
      throw { message: `OpenRouter API returned ${response.status}: ${errorBody}`, code: "PROVIDER_API_ERROR", provider: "openrouter", statusCode: response.status, retryable };
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = data.choices[0]?.message?.content ?? "";

    logger.debug("OpenRouter response received", { model: data.model, contentLength: content.length });

    return {
      content,
      model: data.model,
      provider: "openrouter",
      usage: data.usage ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens } : undefined,
    };
  },

  async *streamChatCompletion(request: AIRequestConfig): AsyncIterable<AIStreamChunk> {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) throw { message: "OpenRouter API key not configured", code: "PROVIDER_NOT_CONFIGURED", provider: "openrouter", retryable: false };

    const body = {
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      stream: true,
    };

    // Build headers object, filtering out undefined values
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    // Add optional headers only if they're defined
    if (env.NEXT_PUBLIC_APP_URL) {
      headers["HTTP-Referer"] = env.NEXT_PUBLIC_APP_URL;
    }
    if (env.NEXT_PUBLIC_APP_NAME) {
      headers["X-Title"] = env.NEXT_PUBLIC_APP_NAME;
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      const retryable = response.status === 429 || response.status >= 500;
      throw { message: `OpenRouter streaming error ${response.status}: ${errorBody}`, code: "PROVIDER_API_ERROR", provider: "openrouter", statusCode: response.status, retryable };
    }

    const reader = response.body?.getReader();
    if (!reader) throw { message: "No response body", code: "NO_STREAM", provider: "openrouter", retryable: false };

    const decoder = new TextDecoder();
    let buffer = "";
    let totalUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            yield { content: "", done: true, provider: "openrouter", model: request.model, usage: totalUsage };
            return;
          }
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
              model?: string;
              usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (parsed.usage) totalUsage = { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens, totalTokens: parsed.usage.total_tokens };
            if (delta) yield { content: delta, done: false, provider: "openrouter", model: parsed.model ?? request.model };
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: "", done: true, provider: "openrouter", model: request.model, usage: totalUsage };
  },
};
