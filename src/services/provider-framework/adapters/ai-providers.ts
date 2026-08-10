/**
 * AI Provider Adapters for the Provider Framework.
 *
 * Thin wrappers that delegate to the existing AI service adapters.
 * Lazy-loaded — no API calls made during import.
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderResult,
  ProviderHealthResult,
} from "../types";
import { env } from "@/config/env";
import type { AIMessage } from "@/services/ai/types";
import { logger } from "@/services/logger";

// ─── Shared Helpers ──────────────────────────────────────────

function aiProviderCapabilities(caps: string[]): string[] {
  return ["chat", "completion", ...caps];
}

/**
 * Run a lightweight test call to verify credentials work.
 * Uses a tiny prompt with max_tokens=1 to minimise cost.
 */
async function testCall(
  _providerName: string,
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, max_tokens: 1 }),
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, latencyMs, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════
// OPENAI ADAPTER
// ═══════════════════════════════════════════════════════════════

export const openAiProviderAdapter: ProviderAdapter = {
  id: "openai",
  name: "OpenAI",
  category: "ai",
  capabilities: aiProviderCapabilities(["image", "embedding", "tts"]),

  async authenticate(config: ProviderConfig): Promise<void> {
    const apiKey = (config.credentials.apiKey as string) ?? env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API key is required.");

    const result = await testCall(
      "OpenAI",
      "https://api.openai.com/v1/chat/completions",
      { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }
    );

    if (!result.ok) throw new Error(`OpenAI auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const apiKey = (params.apiKey as string) ?? env.OPENAI_API_KEY;
    if (!apiKey) return { success: false, error: "OpenAI API key is required." };

    // Delegate to existing AI service patterns
    try {
      switch (action) {
        case "chat":
        case "completion": {
          const { sendChatMessage } = await import("@/services/ai/service");
          const response = await sendChatMessage({
            model: (params.model as string) ?? "gpt-4o-mini",
            messages: (params.messages as AIMessage[]) ?? [],
            temperature: params.temperature as number | undefined,
            maxTokens: params.maxTokens as number | undefined,
          });
          return { success: true, data: response };
        }
        default:
          return { success: false, error: `Unsupported action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("OpenAI provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    try {
      if (!env.OPENAI_API_KEY) {
        return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "API key not configured", lastChecked: new Date().toISOString() };
      }
      const result = await testCall(
        "OpenAI",
        "https://api.openai.com/v1/models",
        { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        {}
      );
      return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { healthy: false, latencyMs: Math.round(performance.now() - start), error: msg, lastChecked: new Date().toISOString() };
    }
  },

  getCapabilities(): string[] {
    return this.capabilities;
  },

  destroy(): void {
    // No resources to clean up
  },
};

// ═══════════════════════════════════════════════════════════════
// ANTHROPIC ADAPTER
// ═══════════════════════════════════════════════════════════════

export const anthropicProviderAdapter: ProviderAdapter = {
  id: "anthropic",
  name: "Anthropic Claude",
  category: "ai",
  capabilities: aiProviderCapabilities([]),

  async authenticate(config: ProviderConfig): Promise<void> {
    const apiKey = (config.credentials.apiKey as string) ?? env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Anthropic API key is required.");

    const result = await testCall(
      "Anthropic",
      "https://api.anthropic.com/v1/messages",
      {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      { model: "claude-3-haiku-20240307", messages: [{ role: "user", content: "hi" }] }
    );

    if (!result.ok) throw new Error(`Anthropic auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    if (!env.ANTHROPIC_API_KEY) {
      return { success: false, error: "Anthropic API key is not configured." };
    }

    try {
      switch (action) {
        case "chat":
        case "completion": {
          const { sendChatMessage } = await import("@/services/ai/service");
          const response = await sendChatMessage({
            model: (params.model as string) ?? "claude-3-haiku-20240307",
            messages: (params.messages as AIMessage[]) ?? [],
            temperature: params.temperature as number | undefined,
            maxTokens: params.maxTokens as number | undefined,
          });
          return { success: true, data: response };
        }
        default:
          return { success: false, error: `Unsupported action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Anthropic provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    try {
      if (!env.ANTHROPIC_API_KEY) {
        return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "API key not configured", lastChecked: new Date().toISOString() };
      }
      const result = await testCall(
        "Anthropic",
        "https://api.anthropic.com/v1/messages",
        { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        { model: "claude-3-haiku-20240307", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }
      );
      return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { healthy: false, latencyMs: Math.round(performance.now() - start), error: msg, lastChecked: new Date().toISOString() };
    }
  },

  getCapabilities(): string[] {
    return this.capabilities;
  },

  destroy(): void {
    // No resources to clean up
  },
};

// ═══════════════════════════════════════════════════════════════
// GOOGLE GEMINI ADAPTER
// ═══════════════════════════════════════════════════════════════

export const googleGeminiProviderAdapter: ProviderAdapter = {
  id: "google-gemini",
  name: "Google Gemini",
  category: "ai",
  capabilities: aiProviderCapabilities(["image"]),

  async authenticate(config: ProviderConfig): Promise<void> {
    const apiKey = (config.credentials.apiKey as string) ?? env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("Google AI API key is required.");

    const result = await testCall(
      "Google Gemini",
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { "Content-Type": "application/json" },
      { contents: [{ role: "user", parts: [{ text: "hi" }] }] }
    );

    if (!result.ok) throw new Error(`Google Gemini auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    if (!env.GOOGLE_AI_API_KEY) {
      return { success: false, error: "Google AI API key is not configured." };
    }

    try {
      switch (action) {
        case "chat":
        case "completion": {
          const { sendChatMessage } = await import("@/services/ai/service");
          const response = await sendChatMessage({
            model: (params.model as string) ?? "gemini-2.0-flash",
            messages: (params.messages as AIMessage[]) ?? [],
            temperature: params.temperature as number | undefined,
            maxTokens: params.maxTokens as number | undefined,
          });
          return { success: true, data: response };
        }
        default:
          return { success: false, error: `Unsupported action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Google Gemini provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    try {
      if (!env.GOOGLE_AI_API_KEY) {
        return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "API key not configured", lastChecked: new Date().toISOString() };
      }
      const result = await testCall(
        "Google Gemini",
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GOOGLE_AI_API_KEY}`,
        { "Content-Type": "application/json" },
        { contents: [{ role: "user", parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } }
      );
      return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { healthy: false, latencyMs: Math.round(performance.now() - start), error: msg, lastChecked: new Date().toISOString() };
    }
  },

  getCapabilities(): string[] {
    return this.capabilities;
  },

  destroy(): void {
    // No resources to clean up
  },
};
