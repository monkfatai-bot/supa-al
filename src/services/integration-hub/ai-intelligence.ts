"use server";

/**
 * AI Integration Intelligence
 *
 * Category 23 — AI Integration Intelligence.
 * Provides intelligent provider discovery, selection, and recommendation.
 * Uses health scores, success rates, latency, and historical usage
 * to rank and select the best provider for a given capability.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServiceClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { requireMinimumRole } from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { ServiceResult } from "./types";
import type { Role } from "@/services/rbac/types";

// ─── Types ──────────────────────────────────────────────────────

interface ProviderCandidate {
  integrationId: string;
  accountId: string;
  integrationName: string;
  healthScore: number;
  healthStatus: string;
  successRate: number;
  avgLatencyMs: number;
  usageCount: number;
  confidenceScore: number;
  compositeScore: number;
}

interface SelectOptions {
  preferLowLatency?: boolean;
  preferHighSuccess?: boolean;
  excludeIds?: string[];
}

interface ProviderRecommendation {
  id: string;
  workspace_id: string;
  capability_slug: string;
  integration_id: string;
  usage_count: number;
  success_count: number;
  avg_response_ms: number;
  confidence_score: number;
  priority: number;
  last_used_at: string | null;
  created_at: string;
}

interface SelectionExplanation {
  capabilitySlug: string;
  selectedProvider: {
    integrationId: string;
    integrationName: string;
    compositeScore: number;
  } | null;
  candidates: Array<{
    integrationId: string;
    integrationName: string;
    healthScore: number;
    successRate: number;
    avgLatencyMs: number;
    compositeScore: number;
    excluded: boolean;
    reason?: string;
  }>;
  weights: {
    health: number;
    success: number;
    latency: number;
    usage: number;
  };
}

export type {
  ProviderCandidate,
  SelectOptions,
  ProviderRecommendation,
  SelectionExplanation,
};

// ─── Helpers ────────────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  health: 0.3,
  success: 0.3,
  latency: 0.2,
  usage: 0.2,
};

/** Normalize a value into 0-1 range using min-max across the array. */
function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map((v) => (v - min) / range);
}

/** Calculate composite score for a candidate. */
function calculateCompositeScore(
  healthNorm: number,
  successNorm: number,
  latencyInverseNorm: number,
  usageNorm: number,
  options?: SelectOptions
): number {
  const w = { ...DEFAULT_WEIGHTS };
  if (options?.preferLowLatency) {
    w.latency = 0.35;
    w.usage = 0.05;
  }
  if (options?.preferHighSuccess) {
    w.success = 0.4;
    w.usage = 0.0;
  }

  const score =
    healthNorm * w.health +
    successNorm * w.success +
    latencyInverseNorm * w.latency +
    usageNorm * w.usage;

  return Math.round(score * 1000) / 1000;
}

// ─── discoverProviders ──────────────────────────────────────────

export async function discoverProviders(
  capabilitySlug: string,
  workspaceId: string
): Promise<ServiceResult<ProviderCandidate[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const service = createServiceClient();

    // Resolve capability
    const { data: cap, error: capError } = await service
      .from("integration_capabilities")
      .select("id")
      .eq("slug", capabilitySlug)
      .maybeSingle();

    if (capError || !cap) {
      return { success: false, message: "Capability not found.", error: capError?.message };
    }

    // Get integration-capability mappings joined with accounts
    const { data: mappings, error: mapError } = await supabase
      .from("integration_capabilities_map")
      .select("integration_id")
      .eq("capability_id", cap.id);

    if (mapError) {
      logger.error("Failed to fetch capability mappings", {
        userId: profile.id,
        workspaceId,
        capabilitySlug,
        reason: mapError.message,
      });
      return { success: false, message: "Failed to discover providers.", error: mapError.message };
    }

    const integrationIds = (mappings ?? []).map((m) => m.integration_id);
    if (integrationIds.length === 0) {
      return { success: true, message: "No providers found for this capability.", data: [] };
    }

    // Get accounts for this workspace
    const { data: accounts, error: accError } = await supabase
      .from("integration_accounts")
      .select("id, integration_id")
      .eq("workspace_id", workspaceId)
      .in("integration_id", integrationIds);

    if (accError) {
      return { success: false, message: "Failed to fetch accounts.", error: accError.message };
    }

    // Get integration names
    const { data: integrations } = await service
      .from("integrations")
      .select("id, name")
      .in("id", integrationIds);

    const nameMap = new Map<string, string>();
    for (const i of integrations ?? []) nameMap.set(i.id, i.name);

    // Build candidates with health scores
    const candidates: ProviderCandidate[] = [];
    for (const account of accounts ?? []) {
      // Get health score
      const { data: health } = await supabase
        .from("integration_health_scores")
        .select("score, status")
        .eq("workspace_id", workspaceId)
        .eq("integration_id", account.integration_id)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      candidates.push({
        integrationId: account.integration_id,
        accountId: account.id,
        integrationName: nameMap.get(account.integration_id) ?? "Unknown",
        healthScore: health?.score ?? 0,
        healthStatus: health?.status ?? "unknown",
        successRate: 0,
        avgLatencyMs: 0,
        usageCount: 0,
        confidenceScore: 0,
        compositeScore: 0,
      });
    }

    // Sort by health score descending
    candidates.sort((a, b) => b.healthScore - a.healthScore);

    return {
      success: true,
      message: `Discovered ${candidates.length} providers for '${capabilitySlug}'.`,
      data: candidates,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to discover providers.";
    return { success: false, message, error: message };
  }
}

// ─── selectBestProvider ─────────────────────────────────────────

export async function selectBestProvider(
  capabilitySlug: string,
  workspaceId: string,
  options?: SelectOptions
): Promise<ServiceResult<ProviderCandidate | null>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const service = createServiceClient();
    const excludeSet = new Set(options?.excludeIds ?? []);

    // Resolve capability
    const { data: cap } = await service
      .from("integration_capabilities")
      .select("id")
      .eq("slug", capabilitySlug)
      .maybeSingle();

    if (!cap) {
      return { success: false, message: "Capability not found." };
    }

    // Get mappings
    const { data: mappings } = await supabase
      .from("integration_capabilities_map")
      .select("integration_id")
      .eq("capability_id", cap.id);

    const integrationIds = (mappings ?? []).map((m) => m.integration_id);
    if (integrationIds.length === 0) {
      return { success: true, message: "No providers available.", data: null };
    }

    // Get accounts
    const { data: accounts } = await supabase
      .from("integration_accounts")
      .select("id, integration_id")
      .eq("workspace_id", workspaceId)
      .in("integration_id", integrationIds);

    const filtered = (accounts ?? []).filter((a) => !excludeSet.has(a.integration_id));
    if (filtered.length === 0) {
      return { success: true, message: "No eligible providers after exclusions.", data: null };
    }

    // Build raw scores
    const raw: Array<{
      accountId: string;
      integrationId: string;
      healthScore: number;
      successRate: number;
      avgLatencyMs: number;
      usageCount: number;
      confidenceScore: number;
    }> = [];

    const intIds = filtered.map((a) => a.integration_id);
    const { data: intData } = await service
      .from("integrations")
      .select("id, name")
      .in("id", intIds);
    const nameMap = new Map<string, string>();
    for (const i of intData ?? []) nameMap.set(i.id, i.name);

    for (const account of filtered) {
      const { data: health } = await supabase
        .from("integration_health_scores")
        .select("score, status")
        .eq("workspace_id", workspaceId)
        .eq("integration_id", account.integration_id)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: rec } = await supabase
        .from("ai_provider_recommendations")
        .select("usage_count, success_count, avg_response_ms, confidence_score")
        .eq("workspace_id", workspaceId)
        .eq("capability_slug", capabilitySlug)
        .eq("integration_id", account.integration_id)
        .maybeSingle();

      raw.push({
        accountId: account.id,
        integrationId: account.integration_id,
        healthScore: health?.score ?? 0,
        successRate: rec?.confidence_score ?? 0,
        avgLatencyMs: rec?.avg_response_ms ?? 0,
        usageCount: rec?.usage_count ?? 0,
        confidenceScore: rec?.confidence_score ?? 0,
      });
    }

    // Filter out unhealthy (score < 50)
    const healthy = raw.filter((r) => r.healthScore >= 50);
    if (healthy.length === 0) {
      return { success: true, message: "No healthy providers available.", data: null };
    }

    // Normalize
    const healthArr = normalize(healthy.map((r) => r.healthScore));
    const successArr = normalize(healthy.map((r) => r.successRate));
    const latencyArr = normalize(healthy.map((r) => r.avgLatencyMs));
    const usageArr = normalize(healthy.map((r) => r.usageCount));
    // Invert latency (lower is better)
    const latencyInverseArr = latencyArr.map((v) => 1 - v);

    // Score and rank
    let bestIdx = 0;
    let bestScore = 0;
    const scored: ProviderCandidate[] = [];

    for (let i = 0; i < healthy.length; i++) {
      const composite = calculateCompositeScore(
        healthArr[i], successArr[i], latencyInverseArr[i], usageArr[i], options
      );
      scored.push({
        integrationId: healthy[i].integrationId,
        accountId: healthy[i].accountId,
        integrationName: nameMap.get(healthy[i].integrationId) ?? "Unknown",
        healthScore: healthy[i].healthScore,
        healthStatus: "healthy",
        successRate: healthy[i].successRate,
        avgLatencyMs: healthy[i].avgLatencyMs,
        usageCount: healthy[i].usageCount,
        confidenceScore: healthy[i].confidenceScore,
        compositeScore: composite,
      });
      if (composite > bestScore) {
        bestScore = composite;
        bestIdx = i;
      }
    }

    const selected = scored[bestIdx];

    logger.info("Best provider selected", {
      userId: profile.id,
      workspaceId,
      capabilitySlug,
      selected: selected.integrationId,
      score: selected.compositeScore,
    });

    return {
      success: true,
      message: `Selected ${selected.integrationName} (score: ${selected.compositeScore}).`,
      data: selected,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to select best provider.";
    return { success: false, message, error: message };
  }
}

// ─── getFallbackProviders ───────────────────────────────────────

export async function getFallbackProviders(
  capabilitySlug: string,
  workspaceId: string,
  primaryId: string
): Promise<ServiceResult<ProviderCandidate[]>> {
  try {
    const profile = await requireAuth();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const result = await selectBestProvider(capabilitySlug, workspaceId, {
      excludeIds: [primaryId],
    });

    if (!result.success || !result.data) {
      // Try with even more options — any healthy provider
      const allResult = await discoverProviders(capabilitySlug, workspaceId);
      if (!allResult.success || !allResult.data) {
        return { success: true, message: "No fallback providers available.", data: [] };
      }

      const fallbacks = allResult.data
        .filter((c) => c.integrationId !== primaryId && c.healthScore >= 50)
        .sort((a, b) => b.healthScore - a.healthScore);

      return {
        success: true,
        message: `Found ${fallbacks.length} fallback providers.`,
        data: fallbacks,
      };
    }

    // Get additional fallbacks
    const allResult = await discoverProviders(capabilitySlug, workspaceId);
    const fallbacks = (allResult.data ?? [])
      .filter(
        (c) =>
          c.integrationId !== primaryId &&
          c.integrationId !== result.data!.integrationId &&
          c.healthScore >= 50
      )
      .sort((a, b) => b.healthScore - a.healthScore);

    return {
      success: true,
      message: `Primary: ${result.data.integrationName}, ${fallbacks.length} fallbacks.`,
      data: [result.data, ...fallbacks],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get fallback providers.";
    return { success: false, message, error: message };
  }
}

// ─── recordProviderUsage ────────────────────────────────────────

export async function recordProviderUsage(params: {
  workspaceId: string;
  capabilitySlug: string;
  integrationId: string;
  success: boolean;
  responseMs?: number;
}): Promise<ServiceResult<{ updated: boolean }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "member" as Role);

    const { workspaceId, capabilitySlug, integrationId, success, responseMs } = params;

    // Get existing record
    const { data: existing } = await supabase
      .from("ai_provider_recommendations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("capability_slug", capabilitySlug)
      .eq("integration_id", integrationId)
      .maybeSingle();

    if (existing) {
      const newUsageCount = (existing.usage_count ?? 0) + 1;
      const newSuccessCount = (existing.success_count ?? 0) + (success ? 1 : 0);
      const oldAvg = existing.avg_response_ms ?? 0;
      const newAvg = responseMs != null
        ? Math.round((oldAvg * (newUsageCount - 1) + responseMs) / newUsageCount)
        : oldAvg;
      const confidenceScore = newUsageCount > 0
        ? Math.round((newSuccessCount / newUsageCount) * 1000) / 1000
        : 0;

      const { error } = await supabase
        .from("ai_provider_recommendations")
        .update({
          usage_count: newUsageCount,
          success_count: newSuccessCount,
          avg_response_ms: newAvg,
          confidence_score: confidenceScore,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        logger.error("Failed to update provider usage", {
          userId: profile.id,
          workspaceId,
          integrationId,
          reason: error.message,
        });
        return { success: false, message: "Failed to update usage.", error: error.message };
      }
    } else {
      const confidenceScore = success ? 1 : 0;
      const { error } = await supabase
        .from("ai_provider_recommendations")
        .insert({
          workspace_id: workspaceId,
          capability_slug: capabilitySlug,
          integration_id: integrationId,
          usage_count: 1,
          success_count: success ? 1 : 0,
          avg_response_ms: responseMs ?? 0,
          confidence_score: confidenceScore,
          priority: 0,
          last_used_at: new Date().toISOString(),
        });

      if (error) {
        logger.error("Failed to insert provider usage", {
          userId: profile.id,
          workspaceId,
          integrationId,
          reason: error.message,
        });
        return { success: false, message: "Failed to record usage.", error: error.message };
      }
    }

    return {
      success: true,
      message: "Provider usage recorded.",
      data: { updated: !!existing },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record provider usage.";
    return { success: false, message, error: message };
  }
}

// ─── getProviderRecommendations ─────────────────────────────────

export async function getProviderRecommendations(
  workspaceId: string,
  capabilitySlug?: string
): Promise<ServiceResult<ProviderRecommendation[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    let query = supabase
      .from("ai_provider_recommendations")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (capabilitySlug) {
      query = query.eq("capability_slug", capabilitySlug);
    }

    query = query.order("confidence_score", { ascending: false });

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch provider recommendations", {
        userId: profile.id,
        workspaceId,
        reason: error.message,
      });
      return { success: false, message: "Failed to fetch recommendations.", error: error.message };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} recommendations.`,
      data: (data ?? []) as unknown as ProviderRecommendation[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get provider recommendations.";
    return { success: false, message, error: message };
  }
}

// ─── updateRecommendationPriority ───────────────────────────────

export async function updateRecommendationPriority(
  workspaceId: string,
  capabilitySlug: string,
  integrationId: string,
  priority: number
): Promise<ServiceResult<{ updated: boolean }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin" as Role);

    const { data: existing, error: findError } = await supabase
      .from("ai_provider_recommendations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("capability_slug", capabilitySlug)
      .eq("integration_id", integrationId)
      .maybeSingle();

    if (findError) {
      return { success: false, message: "Failed to find recommendation.", error: findError.message };
    }

    if (!existing) {
      // Create a stub recommendation with the given priority
      const { error: insertError } = await supabase
        .from("ai_provider_recommendations")
        .insert({
          workspace_id: workspaceId,
          capability_slug: capabilitySlug,
          integration_id: integrationId,
          usage_count: 0,
          success_count: 0,
          avg_response_ms: 0,
          confidence_score: 0,
          priority,
        });

      if (insertError) {
        logger.error("Failed to create recommendation", {
          userId: profile.id,
          workspaceId,
          reason: insertError.message,
        });
        return { success: false, message: "Failed to set priority.", error: insertError.message };
      }
    } else {
      const { error: updateError } = await supabase
        .from("ai_provider_recommendations")
        .update({ priority })
        .eq("id", existing.id);

      if (updateError) {
        logger.error("Failed to update recommendation priority", {
          userId: profile.id,
          workspaceId,
          reason: updateError.message,
        });
        return { success: false, message: "Failed to set priority.", error: updateError.message };
      }
    }

    logger.info("Recommendation priority updated", {
      userId: profile.id,
      workspaceId,
      capabilitySlug,
      integrationId,
      priority,
    });

    return {
      success: true,
      message: `Priority set to ${priority}.`,
      data: { updated: !!existing },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update recommendation priority.";
    return { success: false, message, error: message };
  }
}

// ─── explainProviderSelection ───────────────────────────────────

export async function explainProviderSelection(
  capabilitySlug: string,
  workspaceId: string
): Promise<ServiceResult<SelectionExplanation>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member" as Role);

    const service = createServiceClient();

    // Resolve capability
    const { data: cap } = await service
      .from("integration_capabilities")
      .select("id")
      .eq("slug", capabilitySlug)
      .maybeSingle();

    if (!cap) {
      return { success: false, message: "Capability not found." };
    }

    // Get all mappings
    const { data: mappings } = await supabase
      .from("integration_capabilities_map")
      .select("integration_id")
      .eq("capability_id", cap.id);

    const integrationIds = (mappings ?? []).map((m) => m.integration_id);
    if (integrationIds.length === 0) {
      return {
        success: true,
        message: "No providers found for this capability.",
        data: { capabilitySlug, selectedProvider: null, candidates: [], weights: DEFAULT_WEIGHTS },
      };
    }

    // Get accounts
    const { data: accounts } = await supabase
      .from("integration_accounts")
      .select("id, integration_id")
      .eq("workspace_id", workspaceId)
      .in("integration_id", integrationIds);

    // Get names
    const accIntIds = (accounts ?? []).map((a) => a.integration_id);
    const { data: intData } = await service
      .from("integrations")
      .select("id, name")
      .in("id", accIntIds);
    const nameMap = new Map<string, string>();
    for (const i of intData ?? []) nameMap.set(i.id, i.name);

    // Gather raw metrics
    const raw: Array<{
      integrationId: string;
      healthScore: number;
      successRate: number;
      avgLatencyMs: number;
      usageCount: number;
    }> = [];

    for (const account of accounts ?? []) {
      const { data: health } = await supabase
        .from("integration_health_scores")
        .select("score")
        .eq("workspace_id", workspaceId)
        .eq("integration_id", account.integration_id)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: rec } = await supabase
        .from("ai_provider_recommendations")
        .select("usage_count, confidence_score, avg_response_ms")
        .eq("workspace_id", workspaceId)
        .eq("capability_slug", capabilitySlug)
        .eq("integration_id", account.integration_id)
        .maybeSingle();

      raw.push({
        integrationId: account.integration_id,
        healthScore: health?.score ?? 0,
        successRate: rec?.confidence_score ?? 0,
        avgLatencyMs: rec?.avg_response_ms ?? 0,
        usageCount: rec?.usage_count ?? 0,
      });
    }

    // Normalize and score
    const healthArr = normalize(raw.map((r) => r.healthScore));
    const successArr = normalize(raw.map((r) => r.successRate));
    const latencyArr = normalize(raw.map((r) => r.avgLatencyMs));
    const usageArr = normalize(raw.map((r) => r.usageCount));
    const latencyInverseArr = latencyArr.map((v) => 1 - v);

    let bestIdx = -1;
    let bestScore = -1;

    const candidates: SelectionExplanation["candidates"] = raw.map((r, i) => {
      const composite = calculateCompositeScore(
        healthArr[i], successArr[i], latencyInverseArr[i], usageArr[i]
      );
      const excluded = r.healthScore < 50;

      if (!excluded && composite > bestScore) {
        bestScore = composite;
        bestIdx = i;
      }

      return {
        integrationId: r.integrationId,
        integrationName: nameMap.get(r.integrationId) ?? "Unknown",
        healthScore: r.healthScore,
        successRate: r.successRate,
        avgLatencyMs: r.avgLatencyMs,
        compositeScore: composite,
        excluded,
        reason: excluded ? "Health score below 50 (unhealthy)" : undefined,
      };
    });

    const selectedProvider = bestIdx >= 0
      ? {
          integrationId: raw[bestIdx].integrationId,
          integrationName: nameMap.get(raw[bestIdx].integrationId) ?? "Unknown",
          compositeScore: bestScore,
        }
      : null;

    return {
      success: true,
      message: bestIdx >= 0
        ? `Would select ${selectedProvider!.integrationName} (score: ${bestScore}).`
        : "No eligible provider found.",
      data: {
        capabilitySlug,
        selectedProvider,
        candidates,
        weights: DEFAULT_WEIGHTS,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to explain provider selection.";
    return { success: false, message, error: message };
  }
}
