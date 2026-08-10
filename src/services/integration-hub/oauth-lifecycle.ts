"use server";

/**
 * Category 15 — OAuth Lifecycle Management
 *
 * Extends the existing oauth-manager.ts with token expiry monitoring,
 * auto-refresh, revocation detection, and lifecycle audit trails.
 * All crypto/encryption logic is delegated to oauth-manager.ts.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { requireMinimumRole } from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import { refreshOAuthToken } from "./oauth-manager";
import type { ServiceResult } from "./types";

// ─── Types ──────────────────────────────────────────────────────

interface ExpiringTokenAlert {
  tokenId: string;
  accountId: string;
  provider: string;
  expiresAt: string;
  workspaceId: string;
}

interface AutoRefreshResult {
  refreshed: number;
  failed: number;
  failures: Array<{ accountId: string; reason: string }>;
}

interface RevokedAccount {
  accountId: string;
  provider: string;
  workspaceId: string;
}

interface AuditEntry {
  id: string;
  oauth_token_id: string;
  integration_account_id: string;
  workspace_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface LifecycleAccountStatus {
  accountId: string;
  provider: string;
  status: string;
  expiresAt: string | null;
  isExpiringSoon: boolean;
  lastRefreshAt: string | null;
  refreshCount: number;
  needsAttention: boolean;
}

// ─── Provider token-verification URLs ───────────────────────────

const TOKEN_VERIFICATION_URLS: Record<string, string> = {
  google: "https://www.googleapis.com/oauth2/v1/tokeninfo",
  github: "https://api.github.com/user",
  microsoft: "https://graph.microsoft.com/v1.0/me",
  slack: "https://slack.com/api/auth.test",
  discord: "https://discord.com/api/users/@me",
  gitlab: "https://gitlab.com/api/v4/user",
  stripe: "https://api.stripe.com/v1/balance",
};

// ─── Helper: insert audit entry ─────────────────────────────────

async function insertAuditEntry(params: {
  oauthTokenId: string;
  integrationAccountId: string;
  workspaceId: string;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("oauth_token_audit").insert({
    oauth_token_id: params.oauthTokenId,
    integration_account_id: params.integrationAccountId,
    workspace_id: params.workspaceId,
    action: params.action,
    details: params.details ?? {},
  });
  if (error) {
    logger.error("Failed to insert OAuth audit entry", {
      action: params.action,
      reason: error.message,
    });
  }
}

// ─── monitorTokenExpiry ─────────────────────────────────────────

export async function monitorTokenExpiry(): Promise<
  ServiceResult<ExpiringTokenAlert[]>
> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const windowStart = new Date().toISOString();
    const windowEnd = new Date(Date.now() + 86_400_000).toISOString(); // 24h

    const { data: tokens, error } = await supabase
      .from("oauth_tokens")
      .select(
        "id, integration_account_id, provider, expires_at, integration_accounts!inner(workspace_id)"
      )
      .gte("expires_at", windowStart)
      .lte("expires_at", windowEnd)
      .not("expires_at", "is", null);

    if (error) {
      logger.error("Failed to scan expiring tokens", { reason: error.message });
      return {
        success: false,
        message: "Failed to scan expiring tokens.",
        error: error.message,
      };
    }

    const alerts: ExpiringTokenAlert[] = [];
    const rows = (tokens ?? []) as unknown as Array<{
      id: string;
      integration_account_id: string;
      provider: string;
      expires_at: string;
      integration_accounts: { workspace_id: string };
    }>;

    for (const token of rows) {
      const alert: ExpiringTokenAlert = {
        tokenId: token.id,
        accountId: token.integration_account_id,
        provider: token.provider,
        expiresAt: token.expires_at,
        workspaceId: token.integration_accounts.workspace_id,
      };
      alerts.push(alert);

      await insertAuditEntry({
        oauthTokenId: token.id,
        integrationAccountId: token.integration_account_id,
        workspaceId: token.integration_accounts.workspace_id,
        action: "expiration_alert",
        details: {
          provider: token.provider,
          expiresAt: token.expires_at,
          detectedBy: profile.id,
        },
      });
    }

    logger.info("Token expiry scan completed", { count: alerts.length });
    return {
      success: true,
      message: alerts.length > 0
        ? `Found ${alerts.length} token(s) expiring within 24h.`
        : "No tokens expiring within 24h.",
      data: alerts,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token expiry scan failed.";
    logger.error("monitorTokenExpiry error", { error: message });
    return { success: false, message, error: message };
  }
}

// ─── autoRefreshExpiredTokens ───────────────────────────────────

export async function autoRefreshExpiredTokens(): Promise<
  ServiceResult<AutoRefreshResult>
> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const now = new Date().toISOString();

    const { data: tokens, error } = await supabase
      .from("oauth_tokens")
      .select(
        "id, integration_account_id, provider, expires_at, integration_accounts!inner(workspace_id)"
      )
      .lt("expires_at", now)
      .not("refresh_token", "is", null);

    if (error) {
      logger.error("Failed to fetch expired tokens", { reason: error.message });
      return {
        success: false,
        message: "Failed to fetch expired tokens.",
        error: error.message,
      };
    }

    const rows = (tokens ?? []) as unknown as Array<{
      id: string;
      integration_account_id: string;
      provider: string;
      expires_at: string;
      integration_accounts: { workspace_id: string };
    }>;

    const result: AutoRefreshResult = { refreshed: 0, failed: 0, failures: [] };

    for (const token of rows) {
      const refreshResult = await refreshOAuthToken(token.integration_account_id);

      if (refreshResult.success) {
        result.refreshed++;
        await insertAuditEntry({
          oauthTokenId: token.id,
          integrationAccountId: token.integration_account_id,
          workspaceId: token.integration_accounts.workspace_id,
          action: "auto_refresh_success",
          details: { provider: token.provider, triggeredBy: profile.id },
        });
      } else {
        result.failed++;
        result.failures.push({
          accountId: token.integration_account_id,
          reason: refreshResult.message,
        });
        await insertAuditEntry({
          oauthTokenId: token.id,
          integrationAccountId: token.integration_account_id,
          workspaceId: token.integration_accounts.workspace_id,
          action: "auto_refresh_failed",
          details: {
            provider: token.provider,
            reason: refreshResult.message,
            triggeredBy: profile.id,
          },
        });
      }
    }

    logger.info("Auto-refresh completed", {
      refreshed: result.refreshed,
      failed: result.failed,
    });

    return {
      success: true,
      message: `Refreshed ${result.refreshed}, failed ${result.failed}.`,
      data: result,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auto-refresh failed.";
    logger.error("autoRefreshExpiredTokens error", { error: message });
    return { success: false, message, error: message };
  }
}

// ─── detectRevokedTokens ────────────────────────────────────────

export async function detectRevokedTokens(): Promise<
  ServiceResult<RevokedAccount[]>
> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: tokens, error } = await supabase
      .from("oauth_tokens")
      .select(
        "id, provider, access_token, integration_account_id, integration_accounts!inner(workspace_id, status)"
      )
      .eq("integration_accounts.status", "active");

    if (error) {
      logger.error("Failed to fetch active tokens", { reason: error.message });
      return {
        success: false,
        message: "Failed to fetch active tokens.",
        error: error.message,
      };
    }

    const rows = (tokens ?? []) as unknown as Array<{
      id: string;
      provider: string;
      access_token: string;
      integration_account_id: string;
      integration_accounts: { workspace_id: string; status: string };
    }>;

    const revoked: RevokedAccount[] = [];

    for (const token of rows) {
      const verifyUrl = TOKEN_VERIFICATION_URLS[token.provider];
      if (!verifyUrl) continue; // skip providers without verification URL

      try {
        const response = await fetch(verifyUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (response.status === 401) {
          revoked.push({
            accountId: token.integration_account_id,
            provider: token.provider,
            workspaceId: token.integration_accounts.workspace_id,
          });

          // Mark account as needing re-auth
          await supabase
            .from("integration_accounts")
            .update({
              status: "revoked" as const,
              updated_at: new Date().toISOString(),
            })
            .eq("id", token.integration_account_id);

          await insertAuditEntry({
            oauthTokenId: token.id,
            integrationAccountId: token.integration_account_id,
            workspaceId: token.integration_accounts.workspace_id,
            action: "revoked",
            details: { provider: token.provider, detectedBy: profile.id },
          });
        }
      } catch {
        // Network errors are not treated as revocation
        logger.warn("Token verification request failed", {
          provider: token.provider,
          accountId: token.integration_account_id,
        });
      }
    }

    logger.info("Revocation detection completed", { revokedCount: revoked.length });
    return {
      success: true,
      message: revoked.length > 0
        ? `Detected ${revoked.length} revoked token(s).`
        : "No revoked tokens detected.",
      data: revoked,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revocation detection failed.";
    logger.error("detectRevokedTokens error", { error: message });
    return { success: false, message, error: message };
  }
}

// ─── getTokenAuditHistory ───────────────────────────────────────

export async function getTokenAuditHistory(
  workspaceId: string,
  accountId?: string,
  limit: number = 50,
  offset: number = 0
): Promise<ServiceResult<{ entries: AuditEntry[]; total: number }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    let query = supabase
      .from("oauth_token_audit")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (accountId) {
      query = query.eq("integration_account_id", accountId);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch OAuth audit history", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to fetch audit history.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Retrieved ${(data ?? []).length} audit entries.`,
      data: {
        entries: (data ?? []) as unknown as AuditEntry[],
        total: count ?? 0,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get audit history.";
    return { success: false, message, error: message };
  }
}

// ─── getOAuthLifecycleStatus ────────────────────────────────────

export async function getOAuthLifecycleStatus(
  workspaceId: string
): Promise<ServiceResult<LifecycleAccountStatus[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    // Fetch all OAuth tokens with their accounts for this workspace
    const { data: tokens, error } = await supabase
      .from("oauth_tokens")
      .select(
        "id, provider, expires_at, integration_account_id, integration_accounts!inner(id, status)"
      )
      .eq("integration_accounts.workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to fetch lifecycle tokens", { reason: error.message });
      return {
        success: false,
        message: "Failed to fetch lifecycle status.",
        error: error.message,
      };
    }

    const rows = (tokens ?? []) as unknown as Array<{
      id: string;
      provider: string;
      expires_at: string | null;
      integration_account_id: string;
      integration_accounts: { id: string; status: string };
    }>;

    const accountIds = rows.map((r) => r.integration_account_id);
    const statuses: LifecycleAccountStatus[] = [];

    // Fetch refresh audit counts in bulk
    const { data: auditRows } = await supabase
      .from("oauth_token_audit")
      .select("integration_account_id, action, created_at")
      .eq("workspace_id", workspaceId)
      .in("integration_account_id", accountIds.length > 0 ? accountIds : ["__none__"]);

    const auditByAccount = new Map<
      string,
      Array<{ action: string; created_at: string }>
    >();
    for (const a of auditRows ?? []) {
      const list = auditByAccount.get(a.integration_account_id) ?? [];
      list.push({ action: a.action, created_at: a.created_at });
      auditByAccount.set(a.integration_account_id, list);
    }

    const now = Date.now();
    const sevenDaysMs = 7 * 86_400_000;

    for (const row of rows) {
      const audits = auditByAccount.get(row.integration_account_id) ?? [];
      const refreshAudits = audits.filter((a) =>
        a.action === "auto_refresh_success" || a.action === "refresh_success"
      );
      const lastRefresh = refreshAudits.length > 0
        ? refreshAudits.sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0].created_at
        : null;

      const isExpired = row.expires_at
        ? new Date(row.expires_at).getTime() < now
        : false;
      const isExpiringSoon = row.expires_at
        ? new Date(row.expires_at).getTime() < now + sevenDaysMs
        : false;

      const accountStatus = row.integration_accounts.status;
      const needsAttention =
        isExpired ||
        isExpiringSoon ||
        accountStatus === "revoked" ||
        accountStatus === "error";

      statuses.push({
        accountId: row.integration_account_id,
        provider: row.provider,
        status: accountStatus,
        expiresAt: row.expires_at,
        isExpiringSoon,
        lastRefreshAt: lastRefresh,
        refreshCount: refreshAudits.length,
        needsAttention,
      });
    }

    return {
      success: true,
      message: `Lifecycle status for ${statuses.length} account(s).`,
      data: statuses,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get lifecycle status.";
    return { success: false, message, error: message };
  }
}

// ─── scheduleReAuthentication ───────────────────────────────────

export async function scheduleReAuthentication(
  workspaceId: string,
  accountId: string
): Promise<ServiceResult<null>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    // Fetch the token to get its ID
    const { data: token, error: tokenError } = await supabase
      .from("oauth_tokens")
      .select("id, provider")
      .eq("integration_account_id", accountId)
      .single();

    if (tokenError || !token) {
      return {
        success: false,
        message: "OAuth token not found for this account.",
        error: tokenError?.message,
      };
    }

    // Mark the account as needing re-authentication
    const { error: updateError } = await supabase
      .from("integration_accounts")
      .update({
        status: "needs_reauth" as const,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .eq("workspace_id", workspaceId);

    if (updateError) {
      logger.error("Failed to mark account for re-auth", {
        reason: updateError.message,
      });
      return {
        success: false,
        message: "Failed to schedule re-authentication.",
        error: updateError.message,
      };
    }

    await insertAuditEntry({
      oauthTokenId: token.id,
      integrationAccountId: accountId,
      workspaceId,
      action: "reauth_scheduled",
      details: {
        provider: token.provider,
        scheduledBy: profile.id,
      },
    });

    logger.info("Re-authentication scheduled", { accountId, workspaceId });
    return {
      success: true,
      message: "Re-authentication scheduled. The account will need to re-authorize.",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to schedule re-authentication.";
    return { success: false, message, error: message };
  }
}
