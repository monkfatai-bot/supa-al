/**
 * Supa AI — OpenAI provider.
 *
 * Uses the official `openai` SDK v4. The same SDK drives OpenRouter, DeepSeek,
 * Qwen, and Grok via `baseURL` overrides — those providers subclass this.
 *
 * Server-only.
 *
 * @module @/lib/ai/providers/openai
 */
import OpenAI from "openai";

import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";

import { BaseAIProvider } from "../provider";
import type {
  AIModel,
  AIProvider,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  FinishReason,
  ToolCall,
} from "../types";

const DEFAULT_MODEL = "gpt-4o-mini";

/** Static catalog — covers the models we expose in Phase 1. */
const MODELS: AIModel[] = [
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini",
    contextWindow: 128_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 0.15,
    outputCostCentsPer1K: 0.6,
  },
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    contextWindow: 128_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 2.5,
    outputCostCentsPer1K: 10,
  },
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    label: "GPT-4.1 mini",
    contextWindow: 1_000_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 0.4,
    outputCostCentsPer1K: 1.6,
  },
  {
    id: "o4-mini",
    provider: "openai",
    label: "o4-mini",
    contextWindow: 200_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    inputCostCentsPer1K: 1.1,
    outputCostCentsPer1K: 4.4,
  },
];

export class OpenAIProvider extends BaseAIProvider {
  readonly id: AIProvider = "openai";
  protected defaultModel = DEFAULT_MODEL;

  private client: OpenAI | null = null;

  /**
   * Lazy-init the SDK client. Subclasses override `getConfig()` to supply a
   * different apiKey/baseURL (e.g. OpenRouter, DeepSeek, Qwen, Grok).
   */
  protected getConfig(): { apiKey: string; baseURL: string } {
    return {
      apiKey: env.ai.providers.openai.apiKey,
      baseURL: env.ai.providers.openai.baseUrl,
    };
  }

  /** Subclasses can override the model catalog. */
  protected get catalog(): AIModel[] {
    return MODELS;
  }

  protected getClient(): OpenAI {
    if (this.client) return this.client;
    const cfg = this.getConfig();
    if (!cfg.apiKey) {
      throw this.missingKeyError();
    }
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      maxRetries: 2,
      timeout: 60_000,
    });
    return this.client;
  }

  /** Subclass hook for a clearer "missing env var" message. */
  protected missingKeyError(): Error {
    return new Error("OPENAI_API_KEY is not set.");
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const model = this.resolveModel(req);
    const client = this.getClient();
    try {
      const params = this.buildParams(req, model, false);
      const res = await client.chat.completions.create(params);
      return this.toChatResponse(res, model);
    } catch (err) {
      throw this.normalizeError(err, { model, op: "chat" });
    }
  }

  async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const model = this.resolveModel(req);
    const client = this.getClient();
    try {
      const params = this.buildParams(req, model, true);
      const stream = await client.chat.completions.create(params);
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta?.content ?? "";
        const finish = choice.finish_reason
          ? this.mapFinish(choice.finish_reason)
          : undefined;
        yield { delta, finish_reason: finish };
      }
    } catch (err) {
      throw this.normalizeError(err, { model, op: "chatStream" });
    }
  }

  async listModels(): Promise<AIModel[]> {
    return this.catalog;
  }

  // --- internals ---------------------------------------------------------

  /** Build the SDK params object from our {@link ChatRequest}. */
  protected buildParams(
    req: ChatRequest,
    model: string,
    stream: false,
  ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
  protected buildParams(
    req: ChatRequest,
    model: string,
    stream: true,
  ): OpenAI.Chat.ChatCompletionCreateParamsStreaming;
  protected buildParams(
    req: ChatRequest,
    model: string,
    stream: boolean,
  ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming | OpenAI.Chat.ChatCompletionCreateParamsStreaming {
    const params: Record<string, unknown> = {
      model,
      messages: req.messages.map(this.toOpenAIMessage),
      stream,
    };
    if (typeof req.temperature === "number") params.temperature = req.temperature;
    if (typeof req.max_tokens === "number") params.max_tokens = req.max_tokens;
    if (typeof req.top_p === "number") params.top_p = req.top_p;
    if (typeof req.frequency_penalty === "number") params.frequency_penalty = req.frequency_penalty;
    if (typeof req.presence_penalty === "number") params.presence_penalty = req.presence_penalty;
    if (typeof req.user === "string") params.user = req.user;
    if (req.stop) params.stop = req.stop;
    if (req.tools) {
      params.tools = req.tools.map((t) => ({
        type: "function",
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters ?? {},
        },
      }));
    }
    if (req.tool_choice) params.tool_choice = req.tool_choice;
    if (req.response_format) {
      if (req.response_format.type === "json_object") {
        params.response_format = { type: "json_object" };
      } else if (req.response_format.type === "json_schema" && req.response_format.schema) {
        params.response_format = {
          type: "json_schema",
          json_schema: {
            name: "schema",
            schema: req.response_format.schema,
            strict: false,
          },
        };
      } else {
        params.response_format = { type: "text" };
      }
    }
    // `stream_options` lets us receive usage on the final chunk.
    if (stream) {
      params.stream_options = { include_usage: true };
    }
    return params as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
  }

  protected toOpenAIMessage(m: ChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
    const base: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.name) base.name = m.name;
    if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
    if (m.tool_calls) {
      base.tool_calls = m.tool_calls.map((tc: ToolCall) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    return base as unknown as OpenAI.Chat.ChatCompletionMessageParam;
  }

  protected toChatResponse(
    res: OpenAI.Chat.ChatCompletion,
    model: string,
  ): ChatResponse {
    const choice = res.choices[0];
    if (!choice) {
      throw this.normalizeError(new Error("No choices in response."), {
        model,
        op: "chat",
      });
    }
    const msg = choice.message;
    const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
    return {
      id: res.id,
      model,
      provider: this.id,
      message: {
        role: msg.role as ChatMessage["role"],
        content: msg.content ?? "",
        tool_calls: toolCalls,
      },
      usage: {
        prompt_tokens: res.usage?.prompt_tokens ?? 0,
        completion_tokens: res.usage?.completion_tokens ?? 0,
        total_tokens: res.usage?.total_tokens ?? 0,
      },
      finish_reason: this.mapFinish(choice.finish_reason),
      raw: res,
    };
  }

  protected mapFinish(reason: string | null | undefined): FinishReason {
    switch (reason) {
      case "stop": return "stop";
      case "length": return "length";
      case "tool_calls": return "tool_calls";
      case "function": return "tool_calls";
      case "content_filter": return "content_filter";
      default:
        if (reason) logger.debug("Unknown finish_reason", { reason, provider: this.id });
        return "unknown";
    }
  }
}
