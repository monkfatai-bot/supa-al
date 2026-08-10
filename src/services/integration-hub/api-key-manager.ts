
// crypto is server-only (see serverExternalPackages in next.config.ts)

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import {
  verifyWorkspaceMembership,
  requireMinimumRole,
} from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { Json, ApiKeyStatus } from "@/types/generated/database";
import type {
  ApiKeyInfo,
  ApiKeyValidationResult,
  ApiKeyUsageStats,
  CreateApiKeyParams,
  ServiceResult,
} from "./types";
import { encryptToken } from "./oauth-manager";

// ─── Key generation helpers ─────────────────────────────────────

/** Generate a full API key (sk_live_...). */
function generateFullKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `sk_live_${random}`;
}

/** Hash an API key for storage/comparison. */
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Extract a short prefix for display (first 12 chars). */
function keyPrefix(key: string): string {
  return key.substring(0, Math.min(12, key.length));
}

// ─── createApiKey ───────────────────────────────────────────────

export async function createApiKey(
  params: CreateApiKeyParams
): Promise<ServiceResult<{ key: string; keyInfo: ApiKeyInfo }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "admin");

    if (!params.name || params.name.trim().length === 0) {
      return { success: false, message: "Key name is required." };
    }

    const fullKey = generateFullKey();
    const keyHash = await hashKey(fullKey);
    const prefix = keyPrefix(fullKey);
    const encrypted = encryptToken(fullKey);

    const expiresAt = params.expiresInDays
      ? new Date(
          Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000
        ).toISOString()
      : null;

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        workspace_id: params.workspaceId,
        name: params.name.trim(),
        key_hash: keyHash,
        key_prefix: prefix,
        encrypted_key: encrypted,
        permissions: params.permissions,
        scope: params.scope ?? "workspace",
        rate_limit: params.rateLimit ?? 1000,
        expires_at: expiresAt,
        status: "active" as const,
        created_by: profile.id,
      })
      .select(
        "id, name, key_prefix, permissions, scope, rate_limit, usage_count, last_used_at, expires_at, status, created_by, created_at"
      )
      .single();

    if (error || !data) {
      logger.error("Failed to create API key", { reason: error?.message });
      return {
        success: false,
        message: "Failed to create API key.",
        error: error?.message,
      };
    }

    const keyInfo: ApiKeyInfo = {
      id: data.id,
      name: data.name,
      keyPrefix: data.key_prefix,
      permissions: (data.permissions as Json) ?? [],
      scope: data.scope,
      rateLimit: data.rate_limit,
      usageCount: data.usage_count,
      lastUsedAt: data.last_used_at,
      expiresAt: data.expires_at,
      status: data.status as ApiKeyStatus,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };

    logger.info("API key created", { keyId: data.id, name: params.name });

    return {
      success: true,
      message: "API key created. Store it securely — it cannot be retrieved again.",
      data: { key: fullKey, keyInfo },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create API key.";
    return { success: false, message, error: message };
  }
}

// ─── listApiKeys ────────────────────────────────────────────────

export async function listApiKeys(
  workspaceId: string
): Promise<ServiceResult<ApiKeyInfo[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data, error } = await supabase
      .from("api_keys")
      .select(
        "id, name, key_prefix, permissions, scope, rate_limit, usage_count, last_used_at, expires_at, status, created_by, created_at"
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to list API keys", { reason: error.message });
      return {
        success: false,
        message: "Failed to list API keys.",
        error: error.message,
      };
    }

    const keys: ApiKeyInfo[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      permissions: (row.permissions as Json) ?? [],
      scope: row.scope,
      rateLimit: row.rate_limit,
      usageCount: row.usage_count,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      status: row.status as ApiKeyStatus,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));

    return {
      success: true,
      message: `Found ${keys.length} API keys.`,
      data: keys,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list API keys.";
    return { success: false, message, error: message };
  }
}

// ─── getApiKey ──────────────────────────────────────────────────

export async function getApiKey(
  workspaceId: string,
  keyId: string
): Promise<ServiceResult<ApiKeyInfo>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data, error } = await supabase
      .from("api_keys")
      .select(
        "id, name, key_prefix, permissions, scope, rate_limit, usage_count, last_used_at, expires_at, status, created_by, created_at"
      )
      .eq("id", keyId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !data) {
      return {
        success: false,
        message: "API key not found.",
        error: error?.message,
      };
    }

    return {
      success: true,
      message: "API key retrieved.",
      data: {
        id: data.id,
        name: data.name,
        keyPrefix: data.key_prefix,
        permissions: (data.permissions as Json) ?? [],
        scope: data.scope,
        rateLimit: data.rate_limit,
        usageCount: data.usage_count,
        lastUsedAt: data.last_used_at,
        expiresAt: data.expires_at,
        status: data.status as ApiKeyStatus,
        createdBy: data.created_by,
        createdAt: data.created_at,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get API key.";
    return { success: false, message, error: message };
  }
}

// ─── revokeApiKey ───────────────────────────────────────────────

export async function revokeApiKey(
  workspaceId: string,
  keyId: string
): Promise<ServiceResult<null>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const { error } = await supabase
      .from("api_keys")
      .update({ status: "revoked" as const, updated_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to revoke API key", { reason: error.message });
      return {
        success: false,
        message: "Failed to revoke API key.",
        error: error.message,
      };
    }

    logger.info("API key revoked", { keyId });

    return { success: true, message: "API key revoked." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to revoke API key.";
    return { success: false, message, error: message };
  }
}

// ─── rotateApiKey ───────────────────────────────────────────────

export async function rotateApiKey(
  workspaceId: string,
  keyId: string
): Promise<ServiceResult<{ key: string; keyInfo: ApiKeyInfo }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    // Verify the key exists and belongs to workspace
    const { data: existing, error: fetchError } = await supabase
      .from("api_keys")
      .select("id, status, expires_at")
      .eq("id", keyId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        message: "API key not found.",
        error: fetchError?.message,
      };
    }

    // Generate new key
    const fullKey = generateFullKey();
    const keyHash = await hashKey(fullKey);
    const prefix = keyPrefix(fullKey);
    const encrypted = encryptToken(fullKey);

    const { data, error } = await supabase
      .from("api_keys")
      .update({
        key_hash: keyHash,
        key_prefix: prefix,
        encrypted_key: encrypted,
        status: "active" as const,
        usage_count: 0,
        last_used_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", keyId)
      .select(
        "id, name, key_prefix, permissions, scope, rate_limit, usage_count, last_used_at, expires_at, status, created_by, created_at"
      )
      .single();

    if (error || !data) {
      logger.error("Failed to rotate API key", { reason: error?.message });
      return {
        success: false,
        message: "Failed to rotate API key.",
        error: error?.message,
      };
    }

    const keyInfo: ApiKeyInfo = {
      id: data.id,
      name: data.name,
      keyPrefix: data.key_prefix,
      permissions: (data.permissions as Json) ?? [],
      scope: data.scope,
      rateLimit: data.rate_limit,
      usageCount: data.usage_count,
      lastUsedAt: data.last_used_at,
      expiresAt: data.expires_at,
      status: data.status as ApiKeyStatus,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };

    logger.info("API key rotated", { keyId });

    return {
      success: true,
      message: "API key rotated. Old key is now invalid.",
      data: { key: fullKey, keyInfo },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rotate API key.";
    return { success: false, message, error: message };
  }
}

// ─── validateApiKey ─────────────────────────────────────────────

export async function validateApiKey(
  key: string
): Promise<ApiKeyValidationResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const keyHash = await hashKey(key);

    const { data, error } = await supabase
      .from("api_keys")
      .select("id, workspace_id, permissions, status, rate_limit, usage_count, expires_at")
      .eq("key_hash", keyHash)
      .single();

    if (error || !data) {
      return { valid: false };
    }

    // Check status
    if (data.status !== "active") {
      return { valid: false };
    }

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from("api_keys")
        .update({ status: "expired" as const, updated_at: new Date().toISOString() })
        .eq("id", data.id);
      return { valid: false };
    }

    // Check rate limit
    if (data.usage_count >= data.rate_limit) {
      return { valid: false };
    }

    return {
      valid: true,
      keyId: data.id,
      workspaceId: data.workspace_id,
      permissions: data.permissions as Json,
    };
  } catch {
    return { valid: false };
  }
}

// ─── incrementKeyUsage ──────────────────────────────────────────

export async function incrementKeyUsage(
  keyId: string
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    try {
      await supabase.rpc("increment_api_key_usage", { p_key_id: keyId, p_now: now });
    } catch {
      // Fallback: update directly if RPC doesn't exist
      await supabase
        .from("api_keys")
        .update({
          usage_count: 1,
          last_used_at: now,
          updated_at: now,
        })
        .eq("id", keyId);
    }
  } catch {
    // Non-critical — usage tracking failure shouldn't block requests
  }
}

// ─── getApiKeyUsage ─────────────────────────────────────────────

export async function getApiKeyUsage(
  workspaceId: string,
  keyId: string,
  startDate: string,
  endDate: string
): Promise<ServiceResult<ApiKeyUsageStats>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data: key, error: keyError } = await supabase
      .from("api_keys")
      .select("id, usage_count")
      .eq("id", keyId)
      .eq("workspace_id", workspaceId)
      .single();

    if (keyError || !key) {
      return {
        success: false,
        message: "API key not found.",
        error: keyError?.message,
      };
    }

    // Aggregate usage from integration_logs where the key was used
    // (logs store api_key_id in metadata or request)
    const { data: logs, error: logsError } = await supabase
      .from("integration_logs")
      .select("created_at")
      .eq("workspace_id", workspaceId)
      .eq("action", "api_call")
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .order("created_at");

    if (logsError) {
      logger.error("Failed to fetch API key usage", { reason: logsError.message });
      return {
        success: false,
        message: "Failed to fetch usage data.",
        error: logsError.message,
      };
    }

    // Build daily breakdown
    const dailyMap = new Map<string, number>();
    for (const log of logs ?? []) {
      const date = log.created_at.substring(0, 10);
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);
    }

    const dailyUsage = [...dailyMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const stats: ApiKeyUsageStats = {
      totalUsage: key.usage_count,
      dailyUsage,
    };

    return {
      success: true,
      message: "Usage statistics retrieved.",
      data: stats,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get API key usage.";
    return { success: false, message, error: message };
  }
}
