/**
 * Supa AI — Phase 10 integration hooks.
 *
 * TanStack Query wrappers for the /api/v1/integrations/* endpoints.
 *
 * @module @/hooks/use-integrations
 */
"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ApiResponse } from "@/types/api";

// Re-export the server-side MarketplaceApp type for UI components.
import type { MarketplaceApp } from "@/lib/integrations/client";
export type { MarketplaceApp };

// ---------------------------------------------------------------------------
// Types (mirroring what the API returns)
// ---------------------------------------------------------------------------

export interface InstalledApp {
  id: string;
  workspace_id: string;
  app_id: string;
  integration_id: string | null;
  status: string;
  installed_version: string | null;
  installed_at: string;
  app?: MarketplaceApp;
  // camelCase aliases for UI components
  installed_app?: { name: string; version: string };
}

export interface IntegrationLog {
  id: string;
  integration_id: string | null;
  level: string;
  event: string;
  message: string;
  created_at: string;
  duration_ms?: number | null;
}

export interface HealthDashboard {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
  integrations: Array<{
    integrationId: string;
    name: string;
    connectorKey: string;
    status: string;
    healthStatus: string;
    latencyMs: number | null;
    lastCheckAt: string | null;
  }>;
}

export interface IntegrationAnalyticsSummary {
  total_api_calls: number;
  total_api_errors: number;
  overall_error_rate: number;
  avg_latency_ms: number;
  total_sync_runs: number;
  total_records_synced: number;
  total_webhooks_received: number;
  total_webhooks_delivered: number;
  total_rate_limit_hits: number;
  by_integration: Array<{
    integration_id: string;
    connector_key: string;
    name: string;
    api_calls: number;
    api_errors: number;
    avg_latency_ms: number;
    sync_runs: number;
  }>;
}

export interface AnalyticsRow {
  integrationId: string;
  connectorKey: string;
  name: string;
  apiCalls: number;
  apiErrors: number;
  avgLatencyMs: number;
  syncRuns: number;
}

export interface AnalyticsSummary {
  totalApiCalls: number;
  totalApiErrors: number;
  avgErrorRate: number;
  totalSyncRuns: number;
  totalRecordsSynced: number;
  totalWebhooksReceived: number;
  totalWebhooksDelivered: number;
  totalRateLimitHits: number;
  rows: AnalyticsRow[];
}

export interface WebhookSubscription {
  id: string;
  workspace_id: string;
  integration_id: string | null;
  url_slug: string;
  events: unknown;
  target_url: string | null;
  is_active: boolean;
  created_at: string;
  total_received?: number;
  total_failed?: number;
}

export interface WebhookDelivery {
  id: string;
  event_type: string;
  target_url: string;
  status: string;
  http_status: number | null;
  attempt_count: number;
  created_at: string;
}

export interface UpdateCheck {
  installed_app: { id: string; installed_version: string | null };
  app: { id: string; name: string; version: string };
  update_available: boolean;
  // camelCase aliases for UI components
  appId?: string;
  updateAvailable?: boolean;
  latestVersion?: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiRequest<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(err?.error?.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error?.message ?? "Request failed");
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const integrationKeys = {
  all: ["integrations"] as const,
  marketplace: (opts?: { search?: string; category?: string }) =>
    ["integrations", "marketplace", opts] as const,
  categories: ["integrations", "categories"] as const,
  installed: (ws: string) => ["integrations", "installed", ws] as const,
  updates: (ws: string) => ["integrations", "updates", ws] as const,
  health: (ws: string) => ["integrations", "health", ws] as const,
  logs: (ws: string) => ["integrations", "logs", ws] as const,
  analytics: (ws: string) => ["integrations", "analytics", ws] as const,
  webhooks: (ws: string) => ["integrations", "webhooks", ws] as const,
  deliveries: (ws: string) => ["integrations", "deliveries", ws] as const,
};

// ---------------------------------------------------------------------------
// Marketplace hooks
// ---------------------------------------------------------------------------

export function useMarketplaceApps(opts: {
  search?: string;
  category?: string;
  is_featured?: boolean;
  limit?: number;
}) {
  return useQuery({
    queryKey: integrationKeys.marketplace(opts),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.search) params.set("search", opts.search);
      if (opts.category) params.set("category", opts.category);
      if (opts.is_featured) params.set("is_featured", "true");
      if (opts.limit) params.set("limit", String(opts.limit));
      const data = await apiRequest<{ apps: MarketplaceApp[]; categories: unknown[] }>(
        "GET",
        `/api/v1/integrations/marketplace?${params}`,
      );
      return data.apps;
    },
  });
}

export function useMarketplaceCategories() {
  return useQuery({
    queryKey: integrationKeys.categories,
    queryFn: async () => {
      const data = await apiRequest<{ apps: MarketplaceApp[]; categories: Array<{ category: string; count: number }> }>(
        "GET",
        `/api/v1/integrations/marketplace?limit=0`,
      );
      return data.categories.map((c) => c.category);
    },
  });
}

// ---------------------------------------------------------------------------
// Installed apps hooks
// ---------------------------------------------------------------------------

export function useInstalledApps(workspaceId: string) {
  return useQuery({
    queryKey: integrationKeys.installed(workspaceId),
    queryFn: async () => {
      const data = await apiRequest<{ apps: InstalledApp[] }>(
        "GET",
        `/api/v1/integrations/install?workspaceId=${workspaceId}`,
      );
      return data.apps;
    },
    enabled: !!workspaceId,
  });
}

export function useInstallApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { workspaceId: string; appId: string; config?: Record<string, unknown> }) => {
      return apiRequest<{ installed_app: InstalledApp; integration: unknown }>(
        "POST",
        `/api/v1/integrations/install?appId=${params.appId}`,
        { workspace_id: params.workspaceId, config: params.config },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.all });
    },
  });
}

export function useUninstallApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { workspaceId: string; appId: string }) => {
      return apiRequest<{ uninstalled: boolean }>(
        "DELETE",
        `/api/v1/integrations/uninstall?workspaceId=${params.workspaceId}&appId=${params.appId}`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.all });
    },
  });
}

export function useInstallUpdates(workspaceId: string) {
  return useQuery({
    queryKey: integrationKeys.updates(workspaceId),
    queryFn: async () => {
      const data = await apiRequest<{ updates: UpdateCheck[] }>(
        "GET",
        `/api/v1/integrations/install/updates?workspaceId=${workspaceId}`,
      );
      return data.updates;
    },
    enabled: !!workspaceId,
  });
}

// ---------------------------------------------------------------------------
// Health hooks
// ---------------------------------------------------------------------------

export function useHealthDashboard(workspaceId: string) {
  return useQuery({
    queryKey: integrationKeys.health(workspaceId),
    queryFn: async () => {
      const data = await apiRequest<{
        dashboard: {
          total: number;
          healthy: number;
          degraded: number;
          down: number;
          unknown: number;
          integrations: Array<{
            integration: { id: string; name: string; connector_key: string; status: string };
            latest_health: { status: string; latency_ms: number | null; last_check_at: string } | null;
          }>;
        };
      }>("GET", `/api/v1/integrations/health?workspaceId=${workspaceId}`);
      const d = data.dashboard;
      const dashboard: HealthDashboard = {
        total: d.total,
        healthy: d.healthy,
        degraded: d.degraded,
        down: d.down,
        unknown: d.unknown,
        integrations: (d.integrations ?? []).map((item) => ({
          integrationId: item.integration.id,
          name: item.integration.name,
          connectorKey: item.integration.connector_key,
          status: item.integration.status,
          healthStatus: item.latest_health?.status ?? "unknown",
          latencyMs: item.latest_health?.latency_ms ?? null,
          lastCheckAt: item.latest_health?.last_check_at ?? null,
        })),
      };
      return dashboard;
    },
    enabled: !!workspaceId,
  });
}

// ---------------------------------------------------------------------------
// Logs hooks
// ---------------------------------------------------------------------------

export function useIntegrationLogs(opts: {
  workspaceId: string;
  integration_id?: string;
  level?: string;
  event?: string;
  search?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: integrationKeys.logs(opts.workspaceId),
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId: opts.workspaceId });
      if (opts.integration_id) params.set("integration_id", opts.integration_id);
      if (opts.level) params.set("level", opts.level);
      if (opts.event) params.set("event", opts.event);
      if (opts.limit) params.set("limit", String(opts.limit));
      const data = await apiRequest<{ logs: IntegrationLog[] }>(
        "GET",
        `/api/v1/integrations/logs?${params}`,
      );
      return data.logs;
    },
    enabled: !!opts.workspaceId,
  });
}

// ---------------------------------------------------------------------------
// Analytics hooks
// ---------------------------------------------------------------------------

export function useIntegrationAnalytics(opts: { workspaceId: string; days?: number; limit?: number }) {
  return useQuery({
    queryKey: integrationKeys.analytics(opts.workspaceId),
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId: opts.workspaceId });
      if (opts.days) params.set("days", String(opts.days));
      const data = await apiRequest<{ analytics: IntegrationAnalyticsSummary }>(
        "GET",
        `/api/v1/integrations/analytics?${params}`,
      );
      const a = data.analytics;
      const summary: AnalyticsSummary = {
        totalApiCalls: a.total_api_calls,
        totalApiErrors: a.total_api_errors,
        avgErrorRate: a.overall_error_rate,
        totalSyncRuns: a.total_sync_runs,
        totalRecordsSynced: a.total_records_synced,
        totalWebhooksReceived: a.total_webhooks_received,
        totalWebhooksDelivered: a.total_webhooks_delivered,
        totalRateLimitHits: a.total_rate_limit_hits,
        rows: (a.by_integration ?? []).map((r) => ({
          integrationId: r.integration_id,
          connectorKey: r.connector_key,
          name: r.name,
          apiCalls: r.api_calls,
          apiErrors: r.api_errors,
          avgLatencyMs: r.avg_latency_ms,
          syncRuns: r.sync_runs,
        })),
      };
      return summary;
    },
    enabled: !!opts.workspaceId,
  });
}

// ---------------------------------------------------------------------------
// OAuth hooks
// ---------------------------------------------------------------------------

export function useOAuthCallback() {
  return useMutation({
    mutationFn: async (params: { connector_key: string; workspace_id: string }) => {
      return apiRequest<{ authorize_url: string; state: string }>(
        "POST",
        `/api/v1/integrations/oauth/initiate`,
        params,
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Webhook hooks
// ---------------------------------------------------------------------------

export function useWebhookSubscriptions(workspaceId: string) {
  return useQuery({
    queryKey: integrationKeys.webhooks(workspaceId),
    queryFn: async () => {
      const data = await apiRequest<{ subscriptions: WebhookSubscription[] }>(
        "GET",
        `/api/v1/integrations/webhooks?workspaceId=${workspaceId}`,
      );
      return data.subscriptions;
    },
    enabled: !!workspaceId,
  });
}

export function useCreateWebhookSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workspace_id: string;
      integration_id?: string;
      events?: string[];
      target_url?: string;
    }) => {
      const data = await apiRequest<{ subscription: WebhookSubscription; signing_secret: string }>(
        "POST",
        `/api/v1/integrations/webhooks`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.all });
    },
  });
}

export function useDeleteWebhookSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { workspaceId: string; subscriptionId: string }) => {
      return apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/v1/integrations/webhooks?workspaceId=${params.workspaceId}&subscriptionId=${params.subscriptionId}`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.all });
    },
  });
}

export function useWebhookDeliveries(opts: { workspaceId: string; limit?: number }) {
  return useQuery({
    queryKey: integrationKeys.deliveries(opts.workspaceId),
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId: opts.workspaceId });
      if (opts.limit) params.set("limit", String(opts.limit));
      const data = await apiRequest<{ deliveries: WebhookDelivery[] }>(
        "GET",
        `/api/v1/integrations/webhooks/deliveries?${params}`,
      );
      return data.deliveries;
    },
    enabled: !!opts.workspaceId,
  });
}
