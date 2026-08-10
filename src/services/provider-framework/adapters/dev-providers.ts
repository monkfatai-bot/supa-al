/**
 * Development Provider Adapters
 *
 * Production adapters for GitHub, GitLab, and Bitbucket.
 * OAuth-based with real API calls.
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderResult,
  ProviderHealthResult,
} from "../types";
import { env } from "@/config/env";
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
// GITHUB
// ═══════════════════════════════════════════════════════════════

export const githubProviderAdapter: ProviderAdapter = {
  id: "github",
  name: "GitHub",
  category: "development",
  capabilities: ["list_repos", "create_issue", "read_pull_requests", "manage_webhooks", "search_code"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const token = (config.credentials?.accessToken as string) ?? env.GITHUB_TOKEN;
    if (!token) throw new Error("GitHub token is required.");
    const result = await apiCall("GitHub", "https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    if (!result.ok) throw new Error(`GitHub auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const token = (params.accessToken as string) ?? env.GITHUB_TOKEN;
    if (!token) return { success: false, error: "GitHub token is required." };
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" };
    try {
      switch (action) {
        case "list_repos": {
          const res = await apiCall("GitHub", `https://api.github.com/user/repos?per_page=${params.limit ?? 30}&sort=updated`, { headers });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "create_issue": {
          const res = await apiCall("GitHub", `https://api.github.com/repos/${params.owner}/${params.repo}/issues`, {
            method: "POST",
            headers,
            body: JSON.stringify({ title: params.title, body: params.body, assignees: params.assignees ?? [] }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "read_pull_requests": {
          const res = await apiCall("GitHub", `https://api.github.com/repos/${params.owner}/${params.repo}/pulls?state=${params.state ?? "open"}`, { headers });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported GitHub action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("GitHub provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    if (!env.GITHUB_TOKEN) return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "GitHub token not configured", lastChecked: new Date().toISOString() };
    const result = await apiCall("GitHub", "https://api.github.com/user", { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` } });
    return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// GITLAB
// ═══════════════════════════════════════════════════════════════

export const gitlabProviderAdapter: ProviderAdapter = {
  id: "gitlab",
  name: "GitLab",
  category: "development",
  capabilities: ["list_repos", "create_issue", "read_merge_requests", "manage_webhooks", "search_code"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const token = config.credentials?.accessToken as string | undefined;
    if (!token) throw new Error("GitLab requires OAuth. Complete the OAuth flow.");
    const result = await apiCall("GitLab", "https://gitlab.com/api/v4/user", {
      headers: { "PRIVATE-TOKEN": token },
    });
    if (!result.ok) throw new Error(`GitLab auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const token = params.accessToken as string;
    if (!token) return { success: false, error: "GitLab is not connected. Complete the OAuth flow." };
    const headers = { "PRIVATE-TOKEN": token };
    try {
      switch (action) {
        case "list_repos": {
          const res = await apiCall("GitLab", `https://gitlab.com/api/v4/projects?per_page=${params.limit ?? 30}&order_by=last_activity_at`, { headers });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "create_issue": {
          const res = await apiCall("GitLab", `https://gitlab.com/api/v4/projects/${encodeURIComponent(params.projectId as string)}/issues`, {
            method: "POST",
            headers,
            body: JSON.stringify({ title: params.title, description: params.body }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported GitLab action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("GitLab provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "GitLab requires OAuth configuration.", lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// BITBUCKET
// ═══════════════════════════════════════════════════════════════

export const bitbucketProviderAdapter: ProviderAdapter = {
  id: "bitbucket",
  name: "Bitbucket",
  category: "development",
  capabilities: ["list_repos", "create_issue", "read_pull_requests", "manage_webhooks"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const token = config.credentials?.accessToken as string | undefined;
    if (!token) throw new Error("Bitbucket requires OAuth. Complete the OAuth flow.");
    const result = await apiCall("Bitbucket", "https://api.bitbucket.org/2.0/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!result.ok) throw new Error(`Bitbucket auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const token = params.accessToken as string;
    if (!token) return { success: false, error: "Bitbucket is not connected. Complete the OAuth flow." };
    try {
      switch (action) {
        case "list_repos": {
          const res = await apiCall("Bitbucket", "https://api.bitbucket.org/2.0/repositories?role=member&q=&sort=-updated_on", {
            headers: { Authorization: `Bearer ${token}` },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Bitbucket action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Bitbucket provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Bitbucket requires OAuth configuration.", lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};
