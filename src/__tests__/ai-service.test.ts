import { describe, it, expect } from "vitest";
import type {
  AIModelInfo,
  AIRequestConfig,
  AIResponse,
  AIError,
  AIStreamChunk,
} from "@/services/ai/types";

// Pure type/interface tests — no runtime code needed
describe("AI Types", () => {
  it("AIModelInfo has all required fields", () => {
    const model: AIModelInfo = {
      id: "test-model",
      name: "Test Model",
      provider: "test-provider",
      description: "A test model",
      contextWindow: 128000,
      maxOutputTokens: 4096,
      costPerRequest: 0.01,
      capabilities: { streaming: true, functionCalling: false, vision: false, jsonMode: true },
      enabled: true,
    };
    expect(model.id).toBe("test-model");
    expect(model.capabilities.streaming).toBe(true);
  });

  it("AIResponse includes optional usage", () => {
    const responseWithUsage: AIResponse = {
      content: "Hello",
      model: "test-model",
      provider: "test",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
    expect(responseWithUsage.usage?.totalTokens).toBe(15);

    const responseWithoutUsage: AIResponse = {
      content: "Hello",
      model: "test-model",
      provider: "test",
    };
    expect(responseWithoutUsage.usage).toBeUndefined();
  });

  it("AIError includes retryable flag", () => {
    const retryableError: AIError = {
      message: "Rate limited",
      code: "RATE_LIMIT",
      provider: "test",
      statusCode: 429,
      retryable: true,
    };
    expect(retryableError.retryable).toBe(true);

    const nonRetryableError: AIError = {
      message: "Bad request",
      code: "BAD_REQUEST",
      provider: "test",
      statusCode: 400,
      retryable: false,
    };
    expect(nonRetryableError.retryable).toBe(false);
  });

  it("AIStreamChunk has done flag", () => {
    const chunk: AIStreamChunk = {
      content: "partial",
      done: false,
      provider: "test",
      model: "test-model",
    };
    expect(chunk.done).toBe(false);

    const finalChunk: AIStreamChunk = {
      content: "",
      done: true,
      provider: "test",
      model: "test-model",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
    expect(finalChunk.done).toBe(true);
    expect(finalChunk.usage?.totalTokens).toBe(15);
  });

  it("AIRequestConfig has optional signal", () => {
    const config: AIRequestConfig = {
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      signal: new AbortController().signal,
    };
    expect(config.signal).toBeDefined();

    const configNoSignal: AIRequestConfig = {
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
    };
    expect(configNoSignal.signal).toBeUndefined();
  });
});
