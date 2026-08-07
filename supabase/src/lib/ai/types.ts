/**
 * Supa AI — AI provider abstraction types.
 *
 * Provider-agnostic shapes for chat completions, streaming, tools, and
 * usage. Every provider implementation maps its native SDK to these types
 * so call sites never branch on provider.
 *
 * @module @/lib/ai/types
 */

/** Provider identifiers supported by the platform. */
export type AIProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "deepseek"
  | "qwen"
  | "grok";

/** Role of a chat message. */
export type ChatRole = "system" | "user" | "assistant" | "tool";

/** A single tool call requested by the assistant. */
export interface ToolCall {
  /** Identity of the call (provider-issued). */
  id: string;
  /** Function name to invoke. */
  name: string;
  /** JSON-encoded arguments string. */
  arguments: string;
}

/** One message in a chat conversation. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** For tool-role messages: which call this is the response to. */
  tool_call_id?: string;
  /** For assistant messages: tool calls requested by the model. */
  tool_calls?: ToolCall[];
  /** Optional participant name (used for multi-agent context). */
  name?: string;
}

/** Token usage breakdown. */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Why the model stopped generating. */
export type FinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "error"
  | "unknown";

/** Optional JSON schema / response shape constraint. */
export interface ResponseFormat {
  type: "text" | "json_object" | "json_schema";
  /** When `type === "json_schema"`, the JSON schema to enforce. */
  schema?: object;
}

/** Tool/function definition passed to the model. */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

/** Request to a chat completion endpoint. */
export interface ChatRequest {
  messages: ChatMessage[];
  /** Override the provider's default model. */
  model?: string;
  /** 0..2 sampling temperature (provider-dependent). */
  temperature?: number;
  /** Cap on generated tokens. */
  max_tokens?: number;
  /** Stream tokens as they're generated. */
  stream?: boolean;
  /** Tools the model may call. */
  tools?: ToolDefinition[];
  /** Force the model to call a specific tool, or none. */
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  /** Constrain output shape. */
  response_format?: ResponseFormat;
  /** Stop sequences. */
  stop?: string | string[];
  /** Nucleus sampling. */
  top_p?: number;
  /** Penalize repetition. */
  frequency_penalty?: number;
  presence_penalty?: number;
  /** End-user identifier passed to the provider for abuse monitoring. */
  user?: string;
}

/** Non-streaming chat response. */
export interface ChatResponse {
  id: string;
  model: string;
  provider: AIProvider;
  message: ChatMessage;
  usage: TokenUsage;
  finish_reason: FinishReason;
  /** Provider-reported raw response id (for support tickets). */
  raw?: unknown;
}

/** One chunk from a streaming response. */
export interface ChatStreamChunk {
  /** Partial text delta (may be empty for tool-call deltas in future). */
  delta: string;
  finish_reason?: FinishReason;
  /** Carried on the final chunk only. */
  usage?: TokenUsage;
}

/** Catalog entry for a model offered by a provider. */
export interface AIModel {
  id: string;
  provider: AIProvider;
  /** Human-friendly label. */
  label: string;
  /** Maximum tokens of combined input + output. */
  contextWindow: number;
  /** What this model can do. */
  capabilities: AIModelCapabilities;
  /** Cost in USD cents per 1K tokens (input, output). 0 when unknown. */
  inputCostCentsPer1K?: number;
  outputCostCentsPer1K?: number;
}

export interface AIModelCapabilities {
  chat: boolean;
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  json_mode: boolean;
}

/** Per-call usage record — written to the recorder hook on every chat call. */
export interface UsageRecord {
  orgId?: string;
  userId?: string;
  provider: AIProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Estimated cost in USD cents. */
  costCents: number;
  /** Epoch ms. */
  timestamp: number;
  /** Optional feature tag (e.g. "chat", "image-gen"). */
  feature?: string;
}

/** Function signature for usage recorders plugged into the facade. */
export type UsageRecorder = (record: UsageRecord) => void | Promise<void>;
