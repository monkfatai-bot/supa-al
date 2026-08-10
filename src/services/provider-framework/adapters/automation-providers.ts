/**
 * Automation Provider Adapters
 *
 * Production adapters for Zapier and Make (Integromat).
 * Both use API key authentication with webhook-based triggering.
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderResult,
  ProviderHealthResult,
} from "../types";
import { logger } from "@/services/logger";

async function apiCall(
  _name: string,
  url: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: unknown; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, latencyMs, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, data, latencyMs };
  } catch (err) {
    return { ok: false, latencyMs: Math.round(performance.now() - start), error: err instanceof Error ? err.message : String(err) };
  }
}

// ═══════════════════════════════════════════════════════════════
// ZAPIER
// ═══════════════════════════════════════════════════════════════

export const zapierProviderAdapter: ProviderAdapter = {
  id: "zapier",
  name: "Zapier",
  category: "other",
  capabilities: ["push_event", "list_zaps", "manage_webhooks", "trigger_workflow"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const apiKey = config.credentials?.apiKey as string | undefined;
    if (!apiKey) throw new Error("Zapier API key is required.");
    if (!apiKey.startsWith("sk_")) throw new Error("Invalid Zapier API key format.");
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const apiKey = params.apiKey as string;
    if (!apiKey) return { success: false, error: "Zapier API key is required." };
    try {
      switch (action) {
        case "push_event": {
          const res = await apiCall("Zapier", `https://hooks.zapier.com/hooks/catch/${params.hookId}/`, {
            method: "POST",
            body: JSON.stringify(params.payload ?? {}),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "list_zaps": {
          const res = await apiCall("Zapier", "https://actions.zapier.com/api/v1/zaps/", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Zapier action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Zapier provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Zapier requires API key configuration.", lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// MAKE (Integromat)
// ═══════════════════════════════════════════════════════════════

export const makeProviderAdapter: ProviderAdapter = {
  id: "make",
  name: "Make",
  category: "other",
  capabilities: ["push_event", "list_scenarios", "trigger_scenario", "manage_webhooks"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const apiKey = config.credentials?.apiKey as string | undefined;
    if (!apiKey) throw new Error("Make API key is required.");
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const apiKey = params.apiKey as string;
    if (!apiKey) return { success: false, error: "Make API key is required." };
    try {
      switch (action) {
        case "list_scenarios": {
          const res = await apiCall("Make", "https://www.make.com/api/v2/scenarios", {
            headers: { Authorization: `Token ${apiKey}` },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "trigger_scenario": {
          const res = await apiCall("Make", `https://www.make.com/api/v2/scenarios/${params.scenarioId}/run`, {
            method: "POST",
            headers: { Authorization: `Token ${apiKey}` },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Make action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Make provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Make requires API key configuration.", lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};
