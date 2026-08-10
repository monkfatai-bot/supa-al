/**
 * Google Gemini provider adapter.
 * Communicates with the Google Generative AI API (generateContent + streamGenerateContent).
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

function buildUrl(modelId: string, stream: boolean): string {
  // Strip provider prefix if present (e.g. models/gemini-2.5-flash)
  const modelName = modelId.startsWith("models/") ? modelId : `models/${modelId}`;
  const action = stream ? "streamGenerateContent" : "generateContent";
  return `https://generativelanguage.googleapis.com/v1beta/${modelName}:${action}?key=${env.GOOGLE_AI_API_KEY}`;
}

function toGeminiMessages(messages: AIRequestConfig["messages"]) {
  const systemInstruction = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  return { systemInstruction, contents };
}

export const googleAdapter: AIProviderAdapter = {
  providerId: "google",
  displayName: "Google Gemini",

  getAvailableModels() {
    return getModelsByProvider("google");
  },

  async chatCompletion(request: AIRequestConfig): Promise<AIResponse> {
    const apiKey = env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw {
        message: "Google AI API key is not configured. Set GOOGLE_AI_API_KEY in your environment.",
        code: "PROVIDER_NOT_CONFIGURED",
        provider: "google",
        statusCode: 500,
        retryable: false,
      };
    }

    const { systemInstruction, contents } = toGeminiMessages(request.messages);

    const body: Record<string, unknown> = { contents, generationConfig: { temperature: request.temperature ?? 0.7, maxOutputTokens: request.maxTokens ?? 2048 } };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

    logger.debug("Google AI request", { model: request.model, messageCount: contents.length });

    const response = await fetch(buildUrl(request.model, false), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      const retryable = response.status === 429 || response.status >= 500;
      logger.error("Google AI API error", { status: response.status, body: errorBody, model: request.model });
      throw { message: `Google AI API returned ${response.status}: ${errorBody}`, code: "PROVIDER_API_ERROR", provider: "google", statusCode: response.status, retryable };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      modelVersion?: string;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
    };

    const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    logger.debug("Google AI response received", { model: data.modelVersion ?? request.model, contentLength: content.length });

    return {
      content,
      model: data.modelVersion ?? request.model,
      provider: "google",
      usage: data.usageMetadata
        ? { inputTokens: data.usageMetadata.promptTokenCount, outputTokens: data.usageMetadata.candidatesTokenCount, totalTokens: data.usageMetadata.totalTokenCount }
        : undefined,
    };
  },

  async *streamChatCompletion(request: AIRequestConfig): AsyncIterable<AIStreamChunk> {
    const apiKey = env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw { message: "Google AI API key not configured", code: "PROVIDER_NOT_CONFIGURED", provider: "google", retryable: false };

    const { systemInstruction, contents } = toGeminiMessages(request.messages);
    const body: Record<string, unknown> = { contents, generationConfig: { temperature: request.temperature ?? 0.7, maxOutputTokens: request.maxTokens ?? 2048 } };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

    const response = await fetch(buildUrl(request.model, true), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      const retryable = response.status === 429 || response.status >= 500;
      throw { message: `Google AI streaming error ${response.status}: ${errorBody}`, code: "PROVIDER_API_ERROR", provider: "google", statusCode: response.status, retryable };
    }

    const reader = response.body?.getReader();
    if (!reader) throw { message: "No response body", code: "NO_STREAM", provider: "google", retryable: false };

    const decoder = new TextDecoder();
    let buffer = "";
    let totalInput = 0;
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
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
              usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
            };
            const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
            if (text) {
              yield { content: text, done: false, provider: "google", model: request.model };
            }
            if (parsed.usageMetadata) {
              totalInput = parsed.usageMetadata.promptTokenCount;
              totalOutput = parsed.usageMetadata.candidatesTokenCount;
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
      provider: "google",
      model: request.model,
      usage: { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput },
    };
  },
};
