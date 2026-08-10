"use server";

/**
 * Integration Health Scorer
 *
 * Category 17 — Integration Health Score.
 * Replaces the basic health-monitor.ts with a comprehensive 0-100 scoring system.
 * Evaluates OAuth status, error rates, availability, latency, rate limits,
 * webhook health, and sync status to produce a composite health score.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServiceClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { requireMinimumRole } from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import { checkIntegrationHealth } from "./health-monitor";
import type { ServiceResult } from "./types";
import type { Role } from "@/services/rbac/types";

// ─── Types ──────────────────────────────────────────────────────

type HealthStatus = "healthy" | "warning" | "critical";

interface HealthScoreRecord {
  id: string;
  workspace_id: string;
  integration_id: string;
  account_id: string;
  score: number;
  status: HealthStatus;
  factors: HealthFactors;
  calculated_at: string;
}

interface HealthFactors {
  oauthPenalty: number;
  errorRatePenalty: number;
  availabilityPenalty: number;
  latencyPenalty: number;
  rateLimitPenalty: number;
  webhookPenalty: number;
  syncPenalty: number;
}

interface HealthTrendPoint {
  date: string;
  score: number;
  status: HealthStatus;
}

export type { HealthScoreRecord, HealthFactors, HealthStatus, HealthTrendPoint };

// ─── Helpers ────────────────────────────────────────────────────

function deriveStatus(score: number): HealthStatus {
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function floorScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Parse an ISO date safely. */
function parseDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── calculateHealthScore ──────────────────────────────────────

export async function calculateHealthScore(params: {
  workspaceId: string;
  integrationId: string;
  accountId: string;
}): Promise<ServiceResult<HealthScoreRecord>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "member" as Role);

    const { workspaceId, integrationId, accountId } = params;
    const service = createServiceClient();
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    let score = 100;

    // ── 1. OAuth check ──
    let oauthPenalty = 0;
    const { data: token } = await service
      .from("oauth_tokens")
      .select("expires_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (token?.expires_at) {
      const expiry = parseDate(token.expires_at);
      if (expiry && expiry < now) {
        oauthPenalty = 40;
      } else if (expiry && expiry < new Date(sevenDaysFromNow)) {
        oauthPenalty = 15;
      }
    } else {
      // No OAuth token — check for API key
      const { data: apiKey } = await service
        .from("api_keys")
        .select("id")
        .eq("account_id", accountId)
        .eq("status", "active")
        .maybeSingle();
      if (!apiKey) oauthPenalty = 30;
    }
    score -= oauthPenalty;

    // ── 2. Error rate check (last 24h) ──
    let errorRatePenalty = 0;
    const { count: totalLogs } = await service
      .from("integration_logs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .gte("created_at", twentyFourHoursAgo);

    const { count: errorLogs } = await service
      .from("integration_logs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .eq("status", "error")
      .gte("created_at", twentyFourHoursAgo);

    const total = totalLogs ?? 0;
    const errors = errorLogs ?? 0;
    const errorRate = total > 0 ? errors / total : 0;
    if (errorRate > 0.1) errorRatePenalty = 25;
    else if (errorRate > 0.05) errorRatePenalty = 15;
    score -= errorRatePenalty;

    // ── 3. Availability check ──
    let availabilityPenalty = 0;
    const { data: account } = await supabase
      .from("integration_accounts")
      .select("status")
      .eq("id", accountId)
      .single();

    if (account?.status === "active") {
      const { data: lastSuccessLog } = await service
        .from("integration_logs")
        .select("created_at")
        .eq("workspace_id", workspaceId)
        .eq("integration_id", integrationId)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSuccessLog?.created_at) {
        const lastSuccess = parseDate(lastSuccessLog.created_at);
        if (lastSuccess && now.getTime() - lastSuccess.getTime() > 60 * 60 * 1000) {
          availabilityPenalty = 10;
        }
      }
    }
    score -= availabilityPenalty;

    // ── 4. Latency check (last 24h) ──
    let latencyPenalty = 0;
    const { data: latencyLogs } = await service
      .from("integration_logs")
      .select("duration_ms")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .not("duration_ms", "is", null)
      .gte("created_at", twentyFourHoursAgo);

    if (latencyLogs && latencyLogs.length > 0) {
      const avgLatency = latencyLogs.reduce((sum, l) => sum + (l.duration_ms ?? 0), 0) / latencyLogs.length;
      if (avgLatency > 10000) latencyPenalty = 20;
      else if (avgLatency > 5000) latencyPenalty = 10;
    }
    score -= latencyPenalty;

    // ── 5. Rate limit check (429 errors last 24h) ──
    let rateLimitPenalty = 0;
    const { data: rateLimitLogs } = await service
      .from("integration_logs")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .eq("status", "error")
      .gte("created_at", twentyFourHoursAgo);

    if (rateLimitLogs && rateLimitLogs.length > 0) {
      const has429 = rateLimitLogs.length > 0;
      if (has429) rateLimitPenalty = 15;
    }
    score -= rateLimitPenalty;

    // ── 6. Webhook health check ──
    let webhookPenalty = 0;
    const { data: webhooks } = await service
      .from("webhooks")
      .select("id, success_count, failure_count")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId);

    if (webhooks && webhooks.length > 0) {
      for (const wh of webhooks) {
        const whTotal = (wh.success_count ?? 0) + (wh.failure_count ?? 0);
        if (whTotal > 0 && (wh.failure_count ?? 0) / whTotal > 0.2) {
          webhookPenalty = 15;
          break;
        }
      }
    }
    score -= webhookPenalty;

    // ── 7. Sync check ──
    let syncPenalty = 0;
    const { data: lastSyncLog } = await service
      .from("integration_logs")
      .select("status, created_at")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .eq("action", "sync")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSyncLog && lastSyncLog.status === "error") syncPenalty = 10;
    score -= syncPenalty;

    // ── Run basic health check for additional context ──
    try {
      await checkIntegrationHealth({ integrationAccountId: accountId, workspaceId });
    } catch {
      // Non-critical: basic check is for reference only
    }

    score = floorScore(score);
    const status = deriveStatus(score);
    const factors: HealthFactors = {
      oauthPenalty,
      errorRatePenalty,
      availabilityPenalty,
      latencyPenalty,
      rateLimitPenalty,
      webhookPenalty,
      syncPenalty,
    };

    // ── Upsert into integration_health_scores ──
    const { data: upserted, error: upsertError } = await supabase
      .from("integration_health_scores")
      .upsert(
        {
          workspace_id: workspaceId,
          integration_id: integrationId,
          account_id: accountId,
          score,
          status,
          factors: factors as unknown as Record<string, unknown>,
          calculated_at: now.toISOString(),
        },
        { onConflict: "workspace_id,integration_id,account_id" }
      )
      .select()
      .single();

    if (upsertError) {
      logger.error("Failed to upsert health score", {
        userId: profile.id,
        workspaceId,
        integrationId,
        reason: upsertError.message,
      });
      return {
        success: false,
        message: "Failed to save health score.",
        error: upsertError.message,
      };
    }

    logger.info("Health score calculated", {
      userId: profile.id,
      workspaceId,
      integrationId,
      score,
      status,
    });

    return {
      success: true,
      message: `Health score: ${score} (${status}).`,
      data: upserted as unknown as HealthScoreRecord,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to calculate health score.";
    return { success: false, message, error: message };
  }
}

// ─── getHealthScore ─────────────────────────────────────────────

export async function getHealthScore(
  workspaceId: string,
  integrationId: string
): Promise<ServiceResult<HealthScoreRecord>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const { data, error } = await supabase
      .from("integration_health_scores")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error("Failed to fetch health score", {
        userId: profile.id,
        workspaceId,
        integrationId,
        reason: error.message,
      });
      return { success: false, message: "Failed to fetch health score.", error: error.message };
    }

    if (!data) {
      return { success: true, message: "No health score found.", data: undefined };
    }

    return {
      success: true,
      message: "Health score retrieved.",
      data: data as unknown as HealthScoreRecord,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get health score.";
    return { success: false, message, error: message };
  }
}

// ─── getAllHealthScores ─────────────────────────────────────────

export async function getAllHealthScores(
  workspaceId: string
): Promise<ServiceResult<HealthScoreRecord[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const { data, error } = await supabase
      .from("integration_health_scores")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("score", { ascending: true });

    if (error) {
      logger.error("Failed to fetch all health scores", {
        userId: profile.id,
        workspaceId,
        reason: error.message,
      });
      return { success: false, message: "Failed to fetch health scores.", error: error.message };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} health scores.`,
      data: (data ?? []) as unknown as HealthScoreRecord[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get health scores.";
    return { success: false, message, error: message };
  }
}

// ─── refreshAllHealthScores ─────────────────────────────────────

export async function refreshAllHealthScores(
  workspaceId: string
): Promise<ServiceResult<{ recalculated: number }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin" as Role);

    const { data: accounts, error } = await supabase
      .from("integration_accounts")
      .select("id, integration_id")
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to fetch accounts for refresh", {
        userId: profile.id,
        workspaceId,
        reason: error.message,
      });
      return { success: false, message: "Failed to refresh health scores.", error: error.message };
    }

    let recalculated = 0;
    for (const account of accounts ?? []) {
      const result = await calculateHealthScore({
        workspaceId,
        integrationId: account.integration_id,
        accountId: account.id,
      });
      if (result.success) recalculated++;
    }

    logger.info("All health scores refreshed", {
      userId: profile.id,
      workspaceId,
      recalculated,
    });

    return {
      success: true,
      message: `Refreshed ${recalculated} health scores.`,
      data: { recalculated },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to refresh health scores.";
    return { success: false, message, error: message };
  }
}

// ─── getHealthTrend ─────────────────────────────────────────────

export async function getHealthTrend(
  workspaceId: string,
  integrationId: string,
  days: number = 30
): Promise<ServiceResult<HealthTrendPoint[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("integration_health_scores")
      .select("score, status, calculated_at")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .gte("calculated_at", since)
      .order("calculated_at", { ascending: true });

    if (error) {
      logger.error("Failed to fetch health trend", {
        userId: profile.id,
        workspaceId,
        integrationId,
        reason: error.message,
      });
      return { success: false, message: "Failed to fetch health trend.", error: error.message };
    }

    // Group by date (take the last score per day)
    const dailyMap = new Map<string, HealthTrendPoint>();
    for (const row of data ?? []) {
      const dateStr = (row.calculated_at as string).slice(0, 10);
      dailyMap.set(dateStr, {
        date: dateStr,
        score: row.score as number,
        status: row.status as HealthStatus,
      });
    }

    const trend = Array.from(dailyMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    return {
      success: true,
      message: `Health trend: ${trend.length} data points over ${days} days.`,
      data: trend,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get health trend.";
    return { success: false, message, error: message };
  }
}
