"use server";

/**
 * Integration Analytics
 *
 * Category 18 — Integration Analytics.
 * Provides detailed usage analytics leveraging the `integration_usage_metrics` table.
 * Supports recording, aggregating, and exporting usage data.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { requireMinimumRole } from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { ServiceResult } from "./types";
import type { Role } from "@/services/rbac/types";

// ─── Types ──────────────────────────────────────────────────────

type Period = "7d" | "30d" | "90d";
type GroupBy = "day" | "integration";

interface RecordUsageParams {
  workspaceId: string;
  integrationId: string;
  accountId: string;
  apiRequests?: number;
  failedRequests?: number;
  responseMs?: number;
  credits?: number;
  tokens?: number;
  aiRequests?: number;
  webhooksSent?: number;
  webhooksReceived?: number;
  syncCount?: number;
}

interface AnalyticsParams {
  integrationId?: string;
  period?: Period;
  groupBy?: GroupBy;
}

interface DailyUsageRow {
  date: string;
  apiRequests: number;
  failedRequests: number;
  avgResponseMs: number;
  credits: number;
  tokens: number;
}

interface IntegrationSummary {
  integrationId: string;
  integrationName: string;
 totalRequests: number;
  successRate: number;
  avgResponseMs: number;
  totalCredits: number;
  totalTokens: number;
  aiRequests: number;
  webhooksSent: number;
  webhooksReceived: number;
  syncCount: number;
}

interface IntegrationOverview {
  integrations: IntegrationSummary[];
  totalRequests: number;
  totalCredits: number;
  totalTokens: number;
  topConsumer: IntegrationSummary | null;
}

export type {
  RecordUsageParams,
  AnalyticsParams,
  Period,
  GroupBy,
  DailyUsageRow,
  IntegrationSummary,
  IntegrationOverview,
};

// ─── Helpers ────────────────────────────────────────────────────

function periodToDays(p: Period): number {
  switch (p) {
    case "7d":  return 7;
    case "30d": return 30;
    case "90d": return 90;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sinceISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Escape a value for CSV. */
function csvEscape(val: string | number | null | undefined): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── recordUsage ────────────────────────────────────────────────

export async function recordUsage(
  params: RecordUsageParams
): Promise<ServiceResult<{ upserted: boolean }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "member" as Role);

    const today = todayISO();

    // Try RPC first for atomic upsert
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "upsert_integration_usage_metric",
      {
        p_workspace_id: params.workspaceId,
        p_integration_id: params.integrationId,
        p_account_id: params.accountId,
        p_date: today,
        p_api_requests: params.apiRequests ?? 0,
        p_failed_requests: params.failedRequests ?? 0,
        p_response_ms: params.responseMs ?? 0,
        p_credits: params.credits ?? 0,
        p_tokens: params.tokens ?? 0,
        p_ai_requests: params.aiRequests ?? 0,
        p_webhooks_sent: params.webhooksSent ?? 0,
        p_webhooks_received: params.webhooksReceived ?? 0,
        p_sync_count: params.syncCount ?? 0,
      }
    );

    if (!rpcError && rpcResult) {
      logger.info("Usage recorded via RPC", {
        userId: profile.id,
        workspaceId: params.workspaceId,
        integrationId: params.integrationId,
      });
      return {
        success: true,
        message: "Usage recorded.",
        data: { upserted: true },
      };
    }

    // Fallback: manual upsert
    const row = {
      workspace_id: params.workspaceId,
      integration_id: params.integrationId,
      account_id: params.accountId,
      date: today,
      api_requests: params.apiRequests ?? 0,
      failed_requests: params.failedRequests ?? 0,
      response_ms: params.responseMs ?? 0,
      credits: params.credits ?? 0,
      tokens: params.tokens ?? 0,
      ai_requests: params.aiRequests ?? 0,
      webhooks_sent: params.webhooksSent ?? 0,
      webhooks_received: params.webhooksReceived ?? 0,
      sync_count: params.syncCount ?? 0,
    };

    const { error: upsertError } = await supabase
      .from("integration_usage_metrics")
      .upsert(row, { onConflict: "workspace_id,integration_id,account_id,date" });

    if (upsertError) {
      logger.error("Failed to record usage", {
        userId: profile.id,
        workspaceId: params.workspaceId,
        reason: upsertError.message,
      });
      return {
        success: false,
        message: "Failed to record usage.",
        error: upsertError.message,
      };
    }

    return {
      success: true,
      message: "Usage recorded.",
      data: { upserted: true },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record usage.";
    return { success: false, message, error: message };
  }
}

// ─── getAnalytics ───────────────────────────────────────────────

export async function getAnalytics(
  workspaceId: string,
  params: AnalyticsParams = {}
): Promise<ServiceResult<Record<string, unknown>[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const days = periodToDays(params.period ?? "30d");
    const since = sinceISO(days);

    let query = supabase
      .from("integration_usage_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("date", since.slice(0, 10));

    if (params.integrationId) {
      query = query.eq("integration_id", params.integrationId);
    }

    if (params.groupBy === "day") {
      query = query.order("date", { ascending: true });
    } else {
      query = query.order("integration_id", { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch analytics", {
        userId: profile.id,
        workspaceId,
        reason: error.message,
      });
      return { success: false, message: "Failed to fetch analytics.", error: error.message };
    }

    // Aggregate based on groupBy
    let result: Record<string, unknown>[];

    if (params.groupBy === "day") {
      const dayMap = new Map<string, Record<string, unknown>>();
      for (const row of data ?? []) {
        const d = row.date as string;
        const existing = dayMap.get(d) ?? {
          date: d,
          apiRequests: 0,
          failedRequests: 0,
          totalResponseMs: 0,
          responseCount: 0,
          credits: 0,
          tokens: 0,
          aiRequests: 0,
          webhooksSent: 0,
          webhooksReceived: 0,
          syncCount: 0,
        };
        existing.apiRequests = (existing.apiRequests as number) + (row.api_requests ?? 0);
        existing.failedRequests = (existing.failedRequests as number) + (row.failed_requests ?? 0);
        existing.totalResponseMs = (existing.totalResponseMs as number) + (row.response_ms ?? 0);
        existing.responseCount = (existing.responseCount as number) + ((row.api_requests ?? 0) > 0 ? 1 : 0);
        existing.credits = (existing.credits as number) + (row.credits ?? 0);
        existing.tokens = (existing.tokens as number) + (row.tokens ?? 0);
        existing.aiRequests = (existing.aiRequests as number) + (row.ai_requests ?? 0);
        existing.webhooksSent = (existing.webhooksSent as number) + (row.webhooks_sent ?? 0);
        existing.webhooksReceived = (existing.webhooksReceived as number) + (row.webhooks_received ?? 0);
        existing.syncCount = (existing.syncCount as number) + (row.sync_count ?? 0);
        dayMap.set(d, existing);
      }
      result = Array.from(dayMap.values()).sort(
        (a, b) => (a.date as string).localeCompare(b.date as string)
      );
    } else {
      const intMap = new Map<string, Record<string, unknown>>();
      for (const row of data ?? []) {
        const key = row.integration_id as string;
        const existing = intMap.get(key) ?? {
          integrationId: key,
          apiRequests: 0,
          failedRequests: 0,
          totalResponseMs: 0,
          responseCount: 0,
          credits: 0,
          tokens: 0,
          aiRequests: 0,
          webhooksSent: 0,
          webhooksReceived: 0,
          syncCount: 0,
        };
        existing.apiRequests = (existing.apiRequests as number) + (row.api_requests ?? 0);
        existing.failedRequests = (existing.failedRequests as number) + (row.failed_requests ?? 0);
        existing.totalResponseMs = (existing.totalResponseMs as number) + (row.response_ms ?? 0);
        existing.responseCount = (existing.responseCount as number) + ((row.api_requests ?? 0) > 0 ? 1 : 0);
        existing.credits = (existing.credits as number) + (row.credits ?? 0);
        existing.tokens = (existing.tokens as number) + (row.tokens ?? 0);
        existing.aiRequests = (existing.aiRequests as number) + (row.ai_requests ?? 0);
        existing.webhooksSent = (existing.webhooksSent as number) + (row.webhooks_sent ?? 0);
        existing.webhooksReceived = (existing.webhooksReceived as number) + (row.webhooks_received ?? 0);
        existing.syncCount = (existing.syncCount as number) + (row.sync_count ?? 0);
        intMap.set(key, existing);
      }
      result = Array.from(intMap.values());
    }

    return {
      success: true,
      message: `Analytics: ${result.length} aggregated rows.`,
      data: result,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch analytics.";
    return { success: false, message, error: message };
  }
}

// ─── getIntegrationSummary ──────────────────────────────────────

export async function getIntegrationSummary(
  workspaceId: string,
  integrationId: string,
  period: Period = "30d"
): Promise<ServiceResult<IntegrationSummary>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const days = periodToDays(period);
    const since = sinceISO(days).slice(0, 10);

    // Get integration name
    const { data: integration } = await supabase
      .from("integrations")
      .select("name")
      .eq("id", integrationId)
      .single();

    // Get metrics
    const { data: metrics, error } = await supabase
      .from("integration_usage_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .gte("date", since);

    if (error) {
      logger.error("Failed to fetch integration summary", {
        userId: profile.id,
        workspaceId,
        integrationId,
        reason: error.message,
      });
      return { success: false, message: "Failed to fetch summary.", error: error.message };
    }

    const rows = metrics ?? [];
    let totalRequests = 0;
    let failedRequests = 0;
    let totalResponseMs = 0;
    let responseCount = 0;
    let totalCredits = 0;
    let totalTokens = 0;
    let aiRequests = 0;
    let webhooksSent = 0;
    let webhooksReceived = 0;
    let syncCount = 0;

    for (const row of rows) {
      totalRequests += row.api_requests ?? 0;
      failedRequests += row.failed_requests ?? 0;
      if (row.response_ms > 0) {
        totalResponseMs += row.response_ms;
        responseCount++;
      }
      totalCredits += row.credits ?? 0;
      totalTokens += row.tokens ?? 0;
      aiRequests += row.ai_requests ?? 0;
      webhooksSent += row.webhooks_sent ?? 0;
      webhooksReceived += row.webhooks_received ?? 0;
      syncCount += row.sync_count ?? 0;
    }

    const successRate = totalRequests > 0
      ? Math.round(((totalRequests - failedRequests) / totalRequests) * 1000) / 1000
      : 1;
    const avgResponseMs = responseCount > 0
      ? Math.round(totalResponseMs / responseCount)
      : 0;

    const summary: IntegrationSummary = {
      integrationId,
      integrationName: integration?.name ?? "Unknown",
      totalRequests,
      successRate,
      avgResponseMs,
      totalCredits: totalCredits,
      totalTokens: totalTokens,
      aiRequests,
      webhooksSent,
      webhooksReceived,
      syncCount,
    };

    return {
      success: true,
      message: `Summary for ${integration?.name ?? integrationId}.`,
      data: summary,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get integration summary.";
    return { success: false, message, error: message };
  }
}

// ─── getWorkspaceOverview ───────────────────────────────────────

export async function getWorkspaceOverview(
  workspaceId: string,
  period: Period = "30d"
): Promise<ServiceResult<IntegrationOverview>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const days = periodToDays(period);
    const since = sinceISO(days).slice(0, 10);

    const { data: metrics, error } = await supabase
      .from("integration_usage_metrics")
      .select("integration_id, api_requests, failed_requests, response_ms, credits, tokens, ai_requests, webhooks_sent, webhooks_received, sync_count")
      .eq("workspace_id", workspaceId)
      .gte("date", since);

    if (error) {
      logger.error("Failed to fetch workspace overview", {
        userId: profile.id,
        workspaceId,
        reason: error.message,
      });
      return { success: false, message: "Failed to fetch overview.", error: error.message };
    }

    // Get integration names
    const integrationIds = [...new Set((metrics ?? []).map((m) => m.integration_id))];
    const nameMap = new Map<string, string>();
    if (integrationIds.length > 0) {
      const { data: integrations } = await supabase
        .from("integrations")
        .select("id, name")
        .in("id", integrationIds);
      for (const i of integrations ?? []) {
        nameMap.set(i.id, i.name);
      }
    }

    // Aggregate per integration
    const intMap = new Map<string, {
      totalRequests: number;
      failedRequests: number;
      totalResponseMs: number;
      responseCount: number;
      credits: number;
      tokens: number;
      aiRequests: number;
      webhooksSent: number;
      webhooksReceived: number;
      syncCount: number;
    }>();

    let grandTotalRequests = 0;
    let grandTotalCredits = 0;
    let grandTotalTokens = 0;

    for (const row of metrics ?? []) {
      const existing = intMap.get(row.integration_id) ?? {
        totalRequests: 0, failedRequests: 0, totalResponseMs: 0,
        responseCount: 0, credits: 0, tokens: 0, aiRequests: 0,
        webhooksSent: 0, webhooksReceived: 0, syncCount: 0,
      };
      existing.totalRequests += row.api_requests ?? 0;
      existing.failedRequests += row.failed_requests ?? 0;
      if (row.response_ms > 0) {
        existing.totalResponseMs += row.response_ms;
        existing.responseCount++;
      }
      existing.credits += row.credits ?? 0;
      existing.tokens += row.tokens ?? 0;
      existing.aiRequests += row.ai_requests ?? 0;
      existing.webhooksSent += row.webhooks_sent ?? 0;
      existing.webhooksReceived += row.webhooks_received ?? 0;
      existing.syncCount += row.sync_count ?? 0;
      intMap.set(row.integration_id, existing);

      grandTotalRequests += row.api_requests ?? 0;
      grandTotalCredits += row.credits ?? 0;
      grandTotalTokens += row.tokens ?? 0;
    }

    let topConsumer: IntegrationSummary | null = null;
    const integrations: IntegrationSummary[] = [];

    for (const [id, agg] of intMap.entries()) {
      const successRate = agg.totalRequests > 0
        ? Math.round(((agg.totalRequests - agg.failedRequests) / agg.totalRequests) * 1000) / 1000
        : 1;
      const avgResponseMs = agg.responseCount > 0
        ? Math.round(agg.totalResponseMs / agg.responseCount)
        : 0;

      const summary: IntegrationSummary = {
        integrationId: id,
        integrationName: nameMap.get(id) ?? "Unknown",
        totalRequests: agg.totalRequests,
        successRate,
        avgResponseMs,
        totalCredits: agg.credits,
        totalTokens: agg.tokens,
        aiRequests: agg.aiRequests,
        webhooksSent: agg.webhooksSent,
        webhooksReceived: agg.webhooksReceived,
        syncCount: agg.syncCount,
      };
      integrations.push(summary);

      if (!topConsumer || summary.totalRequests > topConsumer.totalRequests) {
        topConsumer = summary;
      }
    }

    return {
      success: true,
      message: `Overview: ${integrations.length} integrations.`,
      data: {
        integrations,
        totalRequests: grandTotalRequests,
        totalCredits: grandTotalCredits,
        totalTokens: grandTotalTokens,
        topConsumer,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get workspace overview.";
    return { success: false, message, error: message };
  }
}

// ─── exportAnalyticsCsv ─────────────────────────────────────────

export async function exportAnalyticsCsv(
  workspaceId: string,
  period: Period = "30d"
): Promise<ServiceResult<string>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const days = periodToDays(period);
    const since = sinceISO(days).slice(0, 10);

    const { data: metrics, error } = await supabase
      .from("integration_usage_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("date", since)
      .order("date", { ascending: true });

    if (error) {
      logger.error("Failed to export analytics CSV", {
        userId: profile.id,
        workspaceId,
        reason: error.message,
      });
      return { success: false, message: "Failed to export analytics.", error: error.message };
    }

    const header = [
      "date",
      "integration_id",
      "account_id",
      "api_requests",
      "failed_requests",
      "response_ms",
      "credits",
      "tokens",
      "ai_requests",
      "webhooks_sent",
      "webhooks_received",
      "sync_count",
    ];

    const lines: string[] = [header.join(",")];
    for (const row of metrics ?? []) {
      lines.push([
        csvEscape(row.date),
        csvEscape(row.integration_id),
        csvEscape(row.account_id),
        csvEscape(row.api_requests ?? 0),
        csvEscape(row.failed_requests ?? 0),
        csvEscape(row.response_ms ?? 0),
        csvEscape(row.credits ?? 0),
        csvEscape(row.tokens ?? 0),
        csvEscape(row.ai_requests ?? 0),
        csvEscape(row.webhooks_sent ?? 0),
        csvEscape(row.webhooks_received ?? 0),
        csvEscape(row.sync_count ?? 0),
      ].join(","));
    }

    return {
      success: true,
      message: `CSV exported: ${lines.length - 1} rows.`,
      data: lines.join("\n"),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to export analytics.";
    return { success: false, message, error: message };
  }
}

// ─── getDailyUsage ──────────────────────────────────────────────

export async function getDailyUsage(
  workspaceId: string,
  days: number = 30
): Promise<ServiceResult<DailyUsageRow[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const since = sinceISO(days).slice(0, 10);

    const { data: metrics, error } = await supabase
      .from("integration_usage_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("date", since)
      .order("date", { ascending: true });

    if (error) {
      logger.error("Failed to fetch daily usage", {
        userId: profile.id,
        workspaceId,
        reason: error.message,
      });
      return { success: false, message: "Failed to fetch daily usage.", error: error.message };
    }

    const dayMap = new Map<string, {
      apiRequests: number;
      failedRequests: number;
      totalResponseMs: number;
      responseCount: number;
      credits: number;
      tokens: number;
    }>();

    for (const row of metrics ?? []) {
      const d = row.date as string;
      const existing = dayMap.get(d) ?? {
        apiRequests: 0, failedRequests: 0, totalResponseMs: 0,
        responseCount: 0, credits: 0, tokens: 0,
      };
      existing.apiRequests += row.api_requests ?? 0;
      existing.failedRequests += row.failed_requests ?? 0;
      if (row.response_ms > 0) {
        existing.totalResponseMs += row.response_ms;
        existing.responseCount++;
      }
      existing.credits += row.credits ?? 0;
      existing.tokens += row.tokens ?? 0;
      dayMap.set(d, existing);
    }

    const result: DailyUsageRow[] = Array.from(dayMap.entries())
      .map(([date, agg]) => ({
        date,
        apiRequests: agg.apiRequests,
        failedRequests: agg.failedRequests,
        avgResponseMs: agg.responseCount > 0
          ? Math.round(agg.totalResponseMs / agg.responseCount)
          : 0,
        credits: agg.credits,
        tokens: agg.tokens,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      message: `Daily usage: ${result.length} data points.`,
      data: result,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get daily usage.";
    return { success: false, message, error: message };
  }
}
