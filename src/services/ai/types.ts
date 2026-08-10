/**
 * AI Provider types — provider-agnostic.
 * All adapters must conform to these interfaces.
 */

/** Message roles supported by the chat system. */
export type AIMessageRole = "user" | "assistant" | "system";

/** A single message sent to or received from an AI provider. */
export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

/** Capabilities a model may support. */
export interface ModelCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  jsonMode: boolean;
}

/** Metadata about an AI model available for selection. */
export interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  costPerRequest: number;
  capabilities: ModelCapabilities;
  enabled: boolean;
}

/** Configuration passed when making a chat completion request. */
export interface AIRequestConfig {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Response returned by an AI provider after a successful completion. */
export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/** Error thrown when an AI provider request fails. */
export interface AIError {
  message: string;
  code: string;
  provider: string;
  statusCode?: number;
  retryable: boolean;
}

/** A single chunk in a streaming response. */
export interface AIStreamChunk {
  content: string;
  done: boolean;
  provider: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/** Interface every AI provider adapter must implement. */
export interface AIProviderAdapter {
  readonly providerId: string;
  readonly displayName: string;
  getAvailableModels(): AIModelInfo[];
  chatCompletion(request: AIRequestConfig): Promise<AIResponse>;
  streamChatCompletion?(
    request: AIRequestConfig
  ): AsyncIterable<AIStreamChunk>;
}
