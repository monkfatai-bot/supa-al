/**
 * Anthropic Claude provider adapter.
 * Communicates with the Anthropic Messages API.
 */

import type {
  AIProviderAdapter,
  AIRequestConfig,
  AIResponse,
  AIStreamChunk,
} from "../types";
import { env } from "@/config/env";
import { getModelsByProvider } from "../models";
import { logger } from "@/services/logger";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const anthropicAdapter: AIProviderAdapter = {
  providerId: "anthropic",
  displayName: "Anthropic Claude",

  getAvailableModels() {
    return getModelsByProvider("anthropic");
  },

  async chatCompletion(request: AIRequestConfig): Promise<AIResponse> {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw {
        message: "Anthropic API key is not configured. Set ANTHROPIC_API_KEY in your environment.",
        code: "PROVIDER_NOT_CONFIGURED",
        provider: "anthropic",
        statusCode: 500,
        retryable: false,
      };
    }

    // Anthropic uses a separate system parameter
    const systemMessage = request.messages.find((m) => m.role === "system");
    const messages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
    };
    if (systemMessage) {
      body.system = systemMessage.content;
    }

    logger.debug("Anthropic request", { model: request.model, messageCount: messages.length });

    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      const retryable = response.status === 429 || response.status >= 500;
      logger.error("Anthropic API error", { status: response.status, body: errorBody, model: request.model });
      throw {
        message: `Anthropic API returned ${response.status}: ${errorBody}`,
        code: "PROVIDER_API_ERROR",
        provider: "anthropic",
        statusCode: response.status,
        retryable,
      };
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      model: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const textBlocks = data.content.filter((b) => b.type === "text");
    const content = textBlocks.map((b) => b.text).join("");

    logger.debug("Anthropic response received", { model: data.model, contentLength: content.length, usage: data.usage });

    return {
      content,
      model: data.model,
      provider: "anthropic",
      usage: data.usage
        ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens, totalTokens: data.usage.input_tokens + data.usage.output_tokens }
        : undefined,
    };
  },

  async *streamChatCompletion(request: AIRequestConfig): AsyncIterable<AIStreamChunk> {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) throw { message: "Anthropic API key not configured", code: "PROVIDER_NOT_CONFIGURED", provider: "anthropic", retryable: false };

    const systemMessage = request.messages.find((m) => m.role === "system");
    const messages = request.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = { model: request.model, messages, max_tokens: request.maxTokens ?? 2048, temperature: request.temperature ?? 0.7, stream: true };
    if (systemMessage) body.system = systemMessage.content;

    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      const retryable = response.status === 429 || response.status >= 500;
      throw { message: `Anthropic streaming error ${response.status}: ${errorBody}`, code: "PROVIDER_API_ERROR", provider: "anthropic", statusCode: response.status, retryable };
    }

    const reader = response.body?.getReader();
    if (!reader) throw { message: "No response body", code: "NO_STREAM", provider: "anthropic", retryable: false };

    const decoder = new TextDecoder();
    let buffer = "";
    const totalInput = 0;
    let totalOutput = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data) as {
              type: string;
              delta?: { text?: string };
              message?: { usage?: { input_tokens: number; output_tokens: number } };
            };
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              totalOutput += 1; // approximate; real counting from message_stop
              yield { content: parsed.delta.text, done: false, provider: "anthropic", model: request.model };
            }
            if (parsed.type === "message_delta" && parsed.message?.usage) {
              totalOutput = parsed.message.usage.output_tokens;
            }
            if (parsed.type === "message_start") {
              // parsed.message.usage.input_tokens gives input tokens
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield {
      content: "",
      done: true,
      provider: "anthropic",
      model: request.model,
      usage: { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput },
    };
  },
};
