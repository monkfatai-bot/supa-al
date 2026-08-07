/**
 * Supa AI — Abstract AI provider interface + shared base class.
 *
 * Every concrete provider (OpenAI, Anthropic, Google, …) implements
 * {@link AIProviderClient}. The {@link BaseAIProvider} abstract class gives
 * them shared helpers for logging, error normalization, and usage recording.
 *
 * Server-only.
 *
 * @module @/lib/ai/provider
 */
import { AIProviderError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

import type {
  AIModel,
  AIProvider,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  UsageRecord,
  UsageRecorder,
} from "./types";

/** The contract every concrete provider satisfies. */
export interface AIProviderClient {
  readonly id: AIProvider;
  /** Non-streaming chat completion. */
  chat(req: ChatRequest): Promise<ChatResponse>;
  /** Streaming chat completion. Tokens yielded as they arrive. */
  chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk>;
  /** Static catalog of models offered by this provider. */
  listModels(): Promise<AIModel[]>;
}

/**
 * Shared helpers for concrete providers. Subclasses must implement
 * {@link chat}, {@link chatStream}, and {@link listModels}.
 */
export abstract class BaseAIProvider implements AIProviderClient {
  abstract readonly id: AIProvider;
  protected abstract readonly defaultModel: string;

  abstract chat(req: ChatRequest): Promise<ChatResponse>;
  abstract chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk>;
  abstract listModels(): Promise<AIModel[]>;

  /**
   * Normalize any thrown value into an {@link AIProviderError}. Subclasses
   * call this from their try/catch blocks.
   */
  protected normalizeError(err: unknown, context?: Record<string, unknown>): AIProviderError {
    const appErr = toAppError(err);
    if (appErr instanceof AIProviderError) {
      return appErr;
    }
    // Map SDK-specific shapes to readable messages.
    const sdkErr = err as { status?: number; message?: string; error?: { message?: string } };
    const message = sdkErr?.error?.message ?? sdkErr?.message ?? appErr.message;
    const status = sdkErr?.status;
    return new AIProviderError(
      `${this.id} provider error: ${message}`,
      {
        provider: this.id,
        status,
        ...context,
        cause: String(err),
      },
    );
  }

  /** Log + emit a usage record (if a recorder is attached). */
  protected async emitUsage(
    recorder: UsageRecorder | null,
    record: UsageRecord,
  ): Promise<void> {
    if (!recorder) return;
    try {
      await recorder(record);
    } catch (err) {
      // A failing recorder must never break a chat call.
      logger.warn("Usage recorder threw; continuing.", {
        provider: record.provider,
        error: String(err),
      });
    }
  }

  /** Resolve the model from the request or fall back to the provider default. */
  protected resolveModel(req: ChatRequest): string {
    return req.model ?? this.defaultModel;
  }

  /** Compute cost in USD cents from token counts + a pricing table. */
  protected computeCostCents(
    inputTokens: number,
    outputTokens: number,
    inputCostCentsPer1K?: number,
    outputCostCentsPer1K?: number,
  ): number {
    const inCost = (inputTokens / 1000) * (inputCostCentsPer1K ?? 0);
    const outCost = (outputTokens / 1000) * (outputCostCentsPer1K ?? 0);
    return Math.round((inCost + outCost) * 100) / 100;
  }
}

export type { UsageRecord, UsageRecorder } from "./types";
