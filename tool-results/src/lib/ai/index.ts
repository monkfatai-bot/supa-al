/**
 * Supa AI — AI facade.
 *
 * Single entry point for application code. Picks the default provider (or one
 * explicitly requested), records usage via a pluggable recorder, normalizes
 * errors, and exposes both non-streaming (`chat`) and streaming (`chatStream`)
 * entry points. Streaming yields {@link ChatStreamChunk}s without buffering.
 *
 * Server-only.
 *
 * @module @/lib/ai
 */
import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";

import { AIProviderRegistry, aiRegistry } from "./registry";
import { BaseAIProvider, type AIProviderClient } from "./provider";
import type {
  AIModel,
  AIProvider,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  UsageRecord,
  UsageRecorder,
} from "./types";

export type {
  AIModel,
  AIProvider,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatRole,
  ChatStreamChunk,
  FinishReason,
  ResponseFormat,
  TokenUsage,
  ToolCall,
  ToolDefinition,
  UsageRecord,
  UsageRecorder,
} from "./types";
export { BaseAIProvider, type AIProviderClient } from "./provider";
export { AIProviderRegistry, aiRegistry } from "./registry";

/** Optional metadata passed alongside a chat request. */
export interface ChatOptions {
  /** Override the default provider. */
  provider?: AIProvider;
  /** Org to attribute usage to. */
  orgId?: string;
  /** User to attribute usage to. */
  userId?: string;
  /** Feature tag for usage analytics (e.g. "chat", "summarize"). */
  feature?: string;
}

interface AIFacade {
  /** Non-streaming chat completion. */
  chat(req: ChatRequest, opts?: ChatOptions): Promise<ChatResponse>;
  /** Streaming chat completion. Yields chunks as they arrive. */
  chatStream(req: ChatRequest, opts?: ChatOptions): AsyncIterable<ChatStreamChunk>;
  /** Resolve a provider client by id (default if omitted). */
  getProvider(id?: AIProvider): AIProviderClient;
  /** List providers that have an API key configured. */
  listAvailable(): AIProvider[];
  /** List models for a specific provider (default if omitted). */
  listModels(providerId?: AIProvider): Promise<AIModel[]>;
  /** Plug in a usage recorder (called once per chat call). */
  setUsageRecorder(recorder: UsageRecorder | null): void;
}

class AIFacadeImpl implements AIFacade {
  private recorder: UsageRecorder | null = null;

  setUsageRecorder(recorder: UsageRecorder | null): void {
    this.recorder = recorder;
  }

  getProvider(id?: AIProvider): AIProviderClient {
    return id ? aiRegistry.get(id) : aiRegistry.getDefault();
  }

  listAvailable(): AIProvider[] {
    return aiRegistry.listAvailable();
  }

  async listModels(providerId?: AIProvider): Promise<AIModel[]> {
    const client = providerId ? aiRegistry.get(providerId) : aiRegistry.getDefault();
    return client.listModels();
  }

  async chat(req: ChatRequest, opts: ChatOptions = {}): Promise<ChatResponse> {
    const client = this.getProvider(opts.provider);
    const res = await client.chat(req);
    // Record usage (best-effort).
    await this.recordUsage(res, opts);
    return res;
  }

  async *chatStream(
    req: ChatRequest,
    opts: ChatOptions = {},
  ): AsyncIterable<ChatStreamChunk> {
    const client = this.getProvider(opts.provider);
    const model = req.model ?? this.defaultModelFor(client);
    let lastUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
    let lastFinish: ChatStreamChunk["finish_reason"];

    for await (const chunk of client.chatStream(req)) {
      if (chunk.usage) lastUsage = chunk.usage;
      if (chunk.finish_reason) lastFinish = chunk.finish_reason;
      yield chunk;
    }

    // Best-effort usage recording from the final chunk. Token counts may be
    // incomplete when the provider didn't include usage metadata on the
    // stream — we still log what we have so cost analytics can interpolate.
    if (lastUsage) {
      const record = this.buildUsageRecord(
        client.id,
        model,
        lastUsage.prompt_tokens,
        lastUsage.completion_tokens,
        opts,
      );
      await this.safeRecord(record);
    } else if (this.recorder) {
      logger.debug("Stream ended without usage metadata; skipping usage record.", {
        provider: client.id,
        model,
      });
    }
  }

  // --- internals ---------------------------------------------------------

  private defaultModelFor(client: AIProviderClient): string {
    return client instanceof BaseAIProvider
      ? (client as unknown as { defaultModel: string }).defaultModel
      : env.ai.defaultModel;
  }

  private async recordUsage(res: ChatResponse, opts: ChatOptions): Promise<void> {
    if (!this.recorder) return;
    const record = this.buildUsageRecord(
      res.provider,
      res.model,
      res.usage.prompt_tokens,
      res.usage.completion_tokens,
      opts,
    );
    await this.safeRecord(record);
  }

  private buildUsageRecord(
    provider: AIProvider,
    model: string,
    inputTokens: number,
    outputTokens: number,
    opts: ChatOptions,
  ): UsageRecord {
    return {
      orgId: opts.orgId,
      userId: opts.userId,
      provider,
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costCents: 0, // Cost computation requires the model catalog lookup; left to the recorder in Phase 1.
      timestamp: Date.now(),
      feature: opts.feature,
    };
  }

  private async safeRecord(record: UsageRecord): Promise<void> {
    if (!this.recorder) return;
    try {
      await this.recorder(record);
    } catch (err) {
      logger.warn("Usage recorder threw; continuing.", {
        provider: record.provider,
        error: String(err),
      });
    }
  }
}

/** Top-level facade used across the app. */
export const ai: AIFacade = new AIFacadeImpl();
