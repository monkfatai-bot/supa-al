/**
 * Supa AI — Anthropic (Claude) provider.
 *
 * Maps between our `ChatMessage[]` shape and Claude's `system` + `messages[]`
 * split. Claude's `content` is an array of typed blocks (text, tool_use,
 * tool_result) — we flatten text blocks to a string for the unified shape
 * and round-trip tool calls.
 *
 * Server-only.
 *
 * @module @/lib/ai/providers/anthropic
 */
import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/config/env";

import { BaseAIProvider } from "../provider";
import type {
  AIModel,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  FinishReason,
  TokenUsage,
  ToolCall,
} from "../types";

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

const MODELS: AIModel[] = [
  {
    id: "claude-3-5-sonnet-latest",
    provider: "anthropic",
    label: "Claude 3.5 Sonnet",
    contextWindow: 200_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    inputCostCentsPer1K: 3,
    outputCostCentsPer1K: 15,
  },
  {
    id: "claude-3-5-haiku-latest",
    provider: "anthropic",
    label: "Claude 3.5 Haiku",
    contextWindow: 200_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    inputCostCentsPer1K: 0.8,
    outputCostCentsPer1K: 4,
  },
  {
    id: "claude-3-opus-latest",
    provider: "anthropic",
    label: "Claude 3 Opus",
    contextWindow: 200_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: false },
    inputCostCentsPer1K: 15,
    outputCostCentsPer1K: 75,
  },
];

export class AnthropicProvider extends BaseAIProvider {
  readonly id = "anthropic" as const;
  protected defaultModel = DEFAULT_MODEL;

  private client: Anthropic | null = null;

  protected getConfig(): { apiKey: string } {
    return { apiKey: env.ai.providers.anthropic.apiKey };
  }

  protected get catalog(): AIModel[] {
    return MODELS;
  }

  protected getClient(): Anthropic {
    if (this.client) return this.client;
    const cfg = this.getConfig();
    if (!cfg.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set.");
    }
    this.client = new Anthropic({
      apiKey: cfg.apiKey,
      maxRetries: 2,
      timeout: 60_000,
    });
    return this.client;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const model = this.resolveModel(req);
    const client = this.getClient();
    try {
      const params = this.buildParams(req, model);
      const res = await client.messages.create(params);
      return this.toChatResponse(res, model);
    } catch (err) {
      throw this.normalizeError(err, { model, op: "chat" });
    }
  }

  async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const model = this.resolveModel(req);
    const client = this.getClient();
    try {
      const params = this.buildParams(req, model);
      const stream = client.messages.stream(params);
      let finish: FinishReason | undefined;
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { delta: event.delta.text };
        }
        if (event.type === "message_delta" && event.delta.stop_reason) {
          finish = this.mapStop(event.delta.stop_reason);
        }
      }
      const final = await stream.finalMessage();
      const usage: TokenUsage = {
        prompt_tokens: final.usage.input_tokens,
        completion_tokens: final.usage.output_tokens,
        total_tokens: final.usage.input_tokens + final.usage.output_tokens,
      };
      yield {
        delta: "",
        finish_reason: finish ?? this.mapStop(final.stop_reason),
        usage,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, op: "chatStream" });
    }
  }

  async listModels(): Promise<AIModel[]> {
    return this.catalog;
  }

  // --- internals ---------------------------------------------------------

  /**
   * Split our `ChatMessage[]` into Claude's `system` + `messages[]` shape.
   * Tool messages are remapped to `user` role with `tool_result` blocks.
   */
  protected buildParams(
    req: ChatRequest,
    model: string,
  ): Anthropic.MessageCreateParamsNonStreaming {
    const systemParts: string[] = [];
    const messages: Anthropic.MessageParam[] = [];
    for (const m of req.messages) {
      if (m.role === "system") {
        systemParts.push(m.content);
        continue;
      }
      if (m.role === "tool") {
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id ?? "",
              content: m.content,
            },
          ],
        });
        continue;
      }
      if (m.role === "assistant" && m.tool_calls?.length) {
        const blocks: Anthropic.ContentBlock[] = [];
        if (m.content) {
          blocks.push({ type: "text", text: m.content });
        }
        for (const tc of m.tool_calls) {
          let input: unknown = {};
          try {
            input = tc.arguments ? JSON.parse(tc.arguments) : {};
          } catch {
            input = {};
          }
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: input as Record<string, unknown>,
          });
        }
        messages.push({ role: "assistant", content: blocks });
        continue;
      }
      messages.push({ role: m.role, content: m.content });
    }

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      messages,
      max_tokens: req.max_tokens ?? 4096,
    };
    if (systemParts.length) {
      params.system = systemParts.join("\n\n");
    }
    if (typeof req.temperature === "number") params.temperature = req.temperature;
    if (typeof req.top_p === "number") params.top_p = req.top_p;
    if (req.stop) {
      params.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
    }
    if (req.tools) {
      params.tools = req.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Anthropic.Tool.InputSchema,
      }));
    }
    if (req.tool_choice) {
      if (req.tool_choice === "auto") {
        params.tool_choice = { type: "auto" };
      } else if (req.tool_choice === "none") {
        // Anthropic doesn't have "none"; we just omit tools.
      } else if (req.tool_choice === "required") {
        params.tool_choice = { type: "any" };
      } else if (typeof req.tool_choice === "object") {
        params.tool_choice = {
          type: "tool",
          name: req.tool_choice.function.name,
        };
      }
    }
    return params;
  }

  protected toChatResponse(
    res: Anthropic.Message,
    model: string,
  ): ChatResponse {
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];
    for (const block of res.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      }
    }
    return {
      id: res.id,
      model,
      provider: this.id,
      message: {
        role: "assistant",
        content: textParts.join(""),
        tool_calls: toolCalls.length ? toolCalls : undefined,
      },
      usage: {
        prompt_tokens: res.usage.input_tokens,
        completion_tokens: res.usage.output_tokens,
        total_tokens: res.usage.input_tokens + res.usage.output_tokens,
      },
      finish_reason: this.mapStop(res.stop_reason),
      raw: res,
    };
  }

  protected mapStop(reason: string | null | undefined): FinishReason {
    switch (reason) {
      case "end_turn": return "stop";
      case "stop_sequence": return "stop";
      case "max_tokens": return "length";
      case "tool_use": return "tool_calls";
      default: return "unknown";
    }
  }
}
