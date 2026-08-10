/**
 * Integration Health Monitor
 *
 * Provides comprehensive health tracking for all connected integrations.
 * Checks credential validity, measures latency, tracks error rates,
 * and produces actionable health reports.
 */

import { createServiceClient } from "@/lib/supabase/server-client";
import { logger } from "@/services/logger";
import { env } from "@/config/env";

export interface HealthCheckResult {
  integrationId: string;
  integrationName: string;
  healthy: boolean;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  latencyMs?: number;
  errorRate24h?: number;
  lastSuccess?: string;
  lastFailure?: string;
  nextTokenExpiry?: string;
  checks: HealthCheckItem[];
}

interface HealthCheckItem {
  name: string;
  passed: boolean;
  detail?: string;
  durationMs?: number;
}

export interface IntegrationHealthReport {
  generatedAt: string;
  workspaceId: string;
  totalIntegrations: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  unknown: number;
  integrations: HealthCheckResult[];
}

/**
 * Run a health check on a single integration account.
 */
export async function checkIntegrationHealth(params: {
  integrationAccountId: string;
  workspaceId: string;
}): Promise<HealthCheckResult> {
  const supabase = createServiceClient();
  const { integrationAccountId, workspaceId } = params;
  const checks: HealthCheckItem[] = [];
  let healthy = true;
  let status: HealthCheckResult["status"] = "healthy";

  // 1. Fetch the integration account with related data
  const { data: account, error: accountError } = await supabase
    .from("integration_accounts")
    .select(`
      id,
      integration_id,
      status,
      config,
      integrations!inner(id, name, category, status)
    `)
    .eq("id", integrationAccountId)
    .eq("workspace_id", workspaceId)
    .single();

  if (accountError || !account) {
    return {
      integrationId: integrationAccountId,
      integrationName: "Unknown",
      healthy: false,
      status: "unknown",
      checks: [{ name: "account_lookup", passed: false, detail: "Account not found" }],
    };
  }

  const integration = account.integrations as unknown as { id: string; name: string; category: string; status: string };

  // 2. Check integration status
  const integrationActive = account.status === "active" && integration.status === "active";
  checks.push({
    name: "status_check",
    passed: integrationActive,
    detail: integrationActive ? "Integration and account are active" : `Account: ${account.status}, Integration: ${integration.status}`,
  });
  if (!integrationActive) {
    healthy = false;
    status = "unhealthy";
  }

  // 3. Check OAuth token validity
  if (integration.category !== "ai" || !env.OPENAI_API_KEY) {
    const { data: token } = await supabase
      .from("oauth_tokens")
      .select("expires_at, refresh_token")
      .eq("account_id", integrationAccountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (token) {
      const isExpired = token.expires_at && new Date(token.expires_at) < new Date();
      const hasRefresh = !!token.refresh_token;
      checks.push({
        name: "token_validity",
        passed: !isExpired,
        detail: isExpired
          ? `Token expired at ${token.expires_at}. Refresh available: ${hasRefresh}`
          : "Token is valid",
      });
      if (isExpired && !hasRefresh) {
        healthy = false;
        status = "unhealthy";
      } else if (isExpired) {
        status = "degraded";
      }
    } else {
      // No OAuth token — check if API key is configured
      const { data: apiKey } = await supabase
        .from("api_keys")
        .select("status, expires_at")
        .eq("account_id", integrationAccountId)
        .eq("status", "active")
        .maybeSingle();

      if (apiKey) {
        const isExpired = apiKey.expires_at && new Date(apiKey.expires_at) < new Date();
        checks.push({
          name: "api_key_validity",
          passed: !isExpired,
          detail: isExpired ? `API key expired at ${apiKey.expires_at}` : "API key is valid",
        });
        if (isExpired) {
          healthy = false;
          status = "unhealthy";
        }
      }
    }
  }

  // 4. Check error rate (last 24h)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: totalLogs } = await supabase
    .from("integration_logs")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("integration_id", account.integration_id)
    .gte("created_at", twentyFourHoursAgo);

  const { count: errorLogs } = await supabase
    .from("integration_logs")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("integration_id", account.integration_id)
    .eq("status", "error")
    .gte("created_at", twentyFourHoursAgo);

  const errorRate = totalLogs && totalLogs > 0 ? (errorLogs ?? 0) / totalLogs : 0;
  const highErrorRate = errorRate > 0.1;
  checks.push({
    name: "error_rate_24h",
    passed: !highErrorRate,
    detail: `${((errorRate) * 100).toFixed(1)}% error rate (${errorLogs ?? 0}/${totalLogs ?? 0} requests)`,
  });
  if (highErrorRate && healthy) {
    status = "degraded";
  }
  if (highErrorRate) {
    healthy = false;
  }

  // 5. Check last successful and failed log
  const { data: lastSuccess } = await supabase
    .from("integration_logs")
    .select("created_at")
    .eq("workspace_id", workspaceId)
    .eq("integration_id", account.integration_id)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastFailure } = await supabase
    .from("integration_logs")
    .select("created_at")
    .eq("workspace_id", workspaceId)
    .eq("integration_id", account.integration_id)
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    integrationId: account.integration_id,
    integrationName: integration.name,
    healthy,
    status,
    errorRate24h: Math.round(errorRate * 1000) / 1000,
    lastSuccess: lastSuccess?.created_at,
    lastFailure: lastFailure?.created_at,
    checks,
  };
}

/**
 * Generate a full health report for a workspace.
 */
export async function generateHealthReport(workspaceId: string): Promise<IntegrationHealthReport> {
  const supabase = createServiceClient();

  const { data: accounts, error } = await supabase
    .from("integration_accounts")
    .select("id, integration_id, status, integrations!inner(id, name, category, status)")
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to fetch integration accounts for health report", {
      workspaceId,
      error: error.message,
    });
    return {
      generatedAt: new Date().toISOString(),
      workspaceId,
      totalIntegrations: 0,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
      integrations: [],
    };
  }

  const integrations: HealthCheckResult[] = [];
  let healthyCount = 0;
  let degradedCount = 0;
  let unhealthyCount = 0;
  let unknownCount = 0;

  for (const account of accounts ?? []) {
    const result = await checkIntegrationHealth({
      integrationAccountId: account.id,
      workspaceId,
    });
    integrations.push(result);

    switch (result.status) {
      case "healthy": healthyCount++; break;
      case "degraded": degradedCount++; break;
      case "unhealthy": unhealthyCount++; break;
      default: unknownCount++; break;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    totalIntegrations: integrations.length,
    healthy: healthyCount,
    degraded: degradedCount,
    unhealthy: unhealthyCount,
    unknown: unknownCount,
    integrations,
  };
}

/**
 * Check webhook delivery health for a workspace.
 */
export async function checkWebhookHealth(workspaceId: string): Promise<{
  totalWebhooks: number;
  activeWebhooks: number;
  successRate24h: number;
  avgLatencyMs: number;
  deadEvents: number;
}> {
  const supabase = createServiceClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: totalWebhooks } = await supabase
    .from("webhooks")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  const { count: activeWebhooks } = await supabase
    .from("webhooks")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  const { data: events } = await supabase
    .from("webhook_events")
    .select("status, response_time_ms")
    .eq("workspace_id", workspaceId)
    .gte("created_at", twentyFourHoursAgo);

  const allEvents = events ?? [];
  const successEvents = allEvents.filter((e) => e.status === "success");
  const deadEvents = allEvents.filter((e) => e.status === "dead");
  const eventsWithLatency = allEvents.filter((e) => e.response_time_ms !== null);
  const avgLatency = eventsWithLatency.length > 0
    ? Math.round(eventsWithLatency.reduce((sum, e) => sum + (e.response_time_ms ?? 0), 0) / eventsWithLatency.length)
    : 0;

  return {
    totalWebhooks: totalWebhooks ?? 0,
    activeWebhooks: activeWebhooks ?? 0,
    successRate24h: allEvents.length > 0 ? Math.round((successEvents.length / allEvents.length) * 1000) / 1000 : 1,
    avgLatencyMs: avgLatency,
    deadEvents: deadEvents.length,
  };
}
