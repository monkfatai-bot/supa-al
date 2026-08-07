/**
 * Supa AI — Google (Gemini) provider.
 *
 * Uses `@google/generative-ai`. Maps our `ChatMessage[]` to Gemini's
 * `contents` shape (role `user`/`model`; system message goes into
 * `systemInstruction`).
 *
 * Server-only.
 *
 * @module @/lib/ai/providers/google
 */
import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type GenerationConfig,
  type Part,
} from "@google/generative-ai";

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

const DEFAULT_MODEL = "gemini-1.5-flash";

const MODELS: AIModel[] = [
  {
    id: "gemini-1.5-flash",
    provider: "google",
    label: "Gemini 1.5 Flash",
    contextWindow: 1_000_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 0.075,
    outputCostCentsPer1K: 0.3,
  },
  {
    id: "gemini-1.5-pro",
    provider: "google",
    label: "Gemini 1.5 Pro",
    contextWindow: 2_000_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 1.25,
    outputCostCentsPer1K: 5,
  },
  {
    id: "gemini-2.0-flash",
    provider: "google",
    label: "Gemini 2.0 Flash",
    contextWindow: 1_000_000,
    capabilities: { chat: true, streaming: true, tools: true, vision: true, json_mode: true },
    inputCostCentsPer1K: 0.1,
    outputCostCentsPer1K: 0.4,
  },
];

export class GoogleProvider extends BaseAIProvider {
  readonly id = "google" as const;
  protected defaultModel = DEFAULT_MODEL;

  private client: GoogleGenerativeAI | null = null;

  protected getConfig(): { apiKey: string } {
    return { apiKey: env.ai.providers.google.apiKey };
  }

  protected get catalog(): AIModel[] {
    return MODELS;
  }

  protected getClient(): GoogleGenerativeAI {
    if (this.client) return this.client;
    const cfg = this.getConfig();
    if (!cfg.apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
    }
    this.client = new GoogleGenerativeAI(cfg.apiKey);
    return this.client;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const model = this.resolveModel(req);
    const client = this.getClient();
    try {
      const genModel = client.getGenerativeModel(this.buildModelParams(req, model));
      const result = await genModel.generateContent({
        contents: this.toContents(req.messages),
      });
      return this.toChatResponse(result, model);
    } catch (err) {
      throw this.normalizeError(err, { model, op: "chat" });
    }
  }

  async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const model = this.resolveModel(req);
    const client = this.getClient();
    try {
      const genModel = client.getGenerativeModel(this.buildModelParams(req, model));
      const stream = await genModel.generateContentStream({
        contents: this.toContents(req.messages),
      });
      let lastUsage: TokenUsage | undefined;
      let lastFinish: FinishReason | undefined;
      for await (const chunk of stream.stream) {
        const text = chunk.text();
        const candidates = chunk.candidates;
        const finish = candidates?.[0]?.finishReason
          ? this.mapFinish(candidates[0].finishReason)
          : undefined;
        if (finish) lastFinish = finish;
        const meta = chunk.usageMetadata;
        if (meta) {
          lastUsage = {
            prompt_tokens: meta.promptTokenCount ?? 0,
            completion_tokens: meta.candidatesTokenCount ?? 0,
            total_tokens: meta.totalTokenCount ?? 0,
          };
        }
        if (text) yield { delta: text };
      }
      yield { delta: "", finish_reason: lastFinish, usage: lastUsage };
    } catch (err) {
      throw this.normalizeError(err, { model, op: "chatStream" });
    }
  }

  async listModels(): Promise<AIModel[]> {
    return this.catalog;
  }

  // --- internals ---------------------------------------------------------

  protected buildModelParams(req: ChatRequest, model: string): {
    model: string;
    systemInstruction?: string;
    generationConfig?: GenerationConfig;
    tools?: { functionDeclarations: FunctionDeclaration[] }[];
  } {
    const params: {
      model: string;
      systemInstruction?: string;
      generationConfig?: GenerationConfig;
      tools?: { functionDeclarations: FunctionDeclaration[] }[];
    } = { model };
    const systemParts: string[] = [];
    for (const m of req.messages) {
      if (m.role === "system") systemParts.push(m.content);
    }
    if (systemParts.length) params.systemInstruction = systemParts.join("\n\n");

    const genConfig: GenerationConfig = {};
    if (typeof req.temperature === "number") genConfig.temperature = req.temperature;
    if (typeof req.max_tokens === "number") genConfig.maxOutputTokens = req.max_tokens;
    if (typeof req.top_p === "number") genConfig.topP = req.top_p;
    if (req.stop) {
      genConfig.stopSequences = Array.isArray(req.stop) ? req.stop : [req.stop];
    }
    if (req.response_format?.type === "json_object") {
      genConfig.responseMimeType = "application/json";
    } else if (req.response_format?.type === "json_schema") {
      genConfig.responseMimeType = "application/json";
      genConfig.responseSchema = req.response_format.schema as unknown as GenerationConfig["responseSchema"];
    }
    if (Object.keys(genConfig).length > 0) {
      params.generationConfig = genConfig;
    }
    if (req.tools) {
      params.tools = [
        {
          functionDeclarations: req.tools.map((t): FunctionDeclaration => ({
            name: t.function.name,
            description: t.function.description,
            parameters: (t.function.parameters ?? { type: "object", properties: {} }) as unknown as FunctionDeclaration["parameters"],
          })),
        },
      ];
    }
    return params;
  }

  /** Map our `ChatMessage[]` to Gemini's `Content[]`. Drops system messages. */
  protected toContents(messages: ChatMessage[]): Content[] {
    const contents: Content[] = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        // Gemini represents tool responses as a `user` role with `functionResponse` parts.
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: m.name ?? "tool",
                response: { result: m.content },
              },
            },
          ],
        });
        continue;
      }
      if (m.role === "assistant" && m.tool_calls?.length) {
        const parts: Part[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = tc.arguments ? (JSON.parse(tc.arguments) as Record<string, unknown>) : {};
          } catch {
            args = {};
          }
          parts.push({
            functionCall: { name: tc.name, args },
          });
        }
        contents.push({ role: "model", parts });
        continue;
      }
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }
    return contents;
  }

  protected toChatResponse(
    result: unknown,
    model: string,
  ): ChatResponse {
    const response = (result as { response: GoogleResponse }).response;
    const text = safeText(response);
    const meta = response?.usageMetadata;
    const finish = response?.candidates?.[0]?.finishReason
      ? this.mapFinish(response.candidates[0].finishReason)
      : "stop";
    return {
      id: `google-${Date.now()}`,
      model,
      provider: this.id,
      message: {
        role: "assistant",
        content: text,
        tool_calls: extractToolCalls(result),
      },
      usage: {
        prompt_tokens: meta?.promptTokenCount ?? 0,
        completion_tokens: meta?.candidatesTokenCount ?? 0,
        total_tokens: meta?.totalTokenCount ?? 0,
      },
      finish_reason: finish,
      raw: result,
    };
  }

  protected mapFinish(reason: string | null | undefined): FinishReason {
    switch (reason) {
      case "STOP": return "stop";
      case "MAX_TOKENS": return "length";
      case "SAFETY": return "content_filter";
      case "RECITATION": return "content_filter";
      default: return "unknown";
    }
  }
}

/** Subset of the Gemini response shape we read. */
interface GoogleResponse {
  text?: () => string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: unknown } }> };
  }>;
}

/** Extract text safely — the SDK's `text()` throws when the response was blocked. */
function safeText(response: GoogleResponse | undefined): string {
  if (!response) return "";
  try {
    if (typeof response.text === "function") return response.text() ?? "";
  } catch {
    // fall through to manual assembly
  }
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return "";
  return parts.map((p) => p?.text ?? "").join("");
}

/**
 * Pull tool calls out of the Gemini response. The SDK exposes them through
 * `response.candidates[0].content.parts` as `functionCall` parts.
 */
function extractToolCalls(result: unknown): ToolCall[] | undefined {
  const response = (result as { response?: GoogleResponse })?.response;
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!parts) return undefined;
  const calls: ToolCall[] = [];
  for (const p of parts) {
    if (p?.functionCall) {
      calls.push({
        id: `call_${calls.length}`,
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args ?? {}),
      });
    }
  }
  return calls.length ? calls : undefined;
}
