"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import {
  verifyWorkspaceMembership,
  requireMinimumRole,
} from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { Json } from "@/types/generated/database";
import type {
  Integration,
  IntegrationAccount,
  IntegrationLog,
  IntegrationPermission,
} from "@/types/generated/database";
import type {
  IntegrationHealth,
  UsageStats,
  IntegrationWithAccount,
  ServiceResult,
  ListIntegrationsParams,
  ConnectIntegrationParams,
  UpdateIntegrationConfigParams,
  LogIntegrationParams,
  GetIntegrationLogsParams,
  GetUsageAnalyticsParams,
} from "./types";

// ─── Internal: logIntegration (not exported as server action) ────

async function logIntegration(
  params: LogIntegrationParams
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("integration_logs").insert({
      workspace_id: params.workspaceId,
      integration_id: params.integrationId ?? null,
      account_id: params.accountId ?? null,
      action: params.action,
      direction: params.direction,
      request: params.request ?? null,
      response: params.response ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null,
      duration_ms: params.durationMs ?? null,
    });
    if (error) {
      logger.error("Failed to write integration log", {
        reason: error.message,
      });
    }
  } catch (err) {
    logger.error("Unexpected error writing integration log", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── listIntegrations ──────────────────────────────────────────

export async function listIntegrations(
  params: ListIntegrationsParams
): Promise<ServiceResult<IntegrationWithAccount[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(params.workspaceId, profile.id);

    let query = supabase
      .from("integrations")
      .select("*")
      .eq("is_public", true);

    if (params.category) {
      query = query.eq("category", params.category);
    }
    if (params.status) {
      query = query.eq("status", params.status);
    }

    const { data: integrations, error: intError } = await query.order("name");
    if (intError) {
      logger.error("Failed to list integrations", {
        reason: intError.message,
      });
      return {
        success: false,
        message: "Failed to list integrations.",
        error: intError.message,
      };
    }

    // Fetch workspace's connected accounts
    const { data: accounts, error: accError } = await supabase
      .from("integration_accounts")
      .select("*")
      .eq("workspace_id", params.workspaceId);

    if (accError) {
      logger.error("Failed to list integration accounts", {
        reason: accError.message,
      });
      return {
        success: false,
        message: "Failed to list integration accounts.",
        error: accError.message,
      };
    }

    const accountMap = new Map(
      (accounts ?? []).map((a) => [a.integration_id, a])
    );

    const enriched = (integrations ?? []).map((int) => ({
      ...int,
      account: accountMap.get(int.id) ?? null,
    })) as IntegrationWithAccount[];

    return {
      success: true,
      message: `Found ${enriched.length} integrations.`,
      data: enriched,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list integrations.";
    return { success: false, message, error: message };
  }
}

// ─── getIntegration ────────────────────────────────────────────

export async function getIntegration(
  id: string
): Promise<ServiceResult<Integration>> {
  try {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return {
        success: false,
        message: "Integration not found.",
        error: error?.message,
      };
    }

    return { success: true, message: "Integration retrieved.", data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get integration.";
    return { success: false, message, error: message };
  }
}

// ─── connectIntegration ────────────────────────────────────────

export async function connectIntegration(
  params: ConnectIntegrationParams
): Promise<ServiceResult<IntegrationAccount>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "admin");

    // Verify the integration exists
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("id, auth_type")
      .eq("id", params.integrationId)
      .single();

    if (intError || !integration) {
      return {
        success: false,
        message: "Integration not found.",
        error: intError?.message,
      };
    }

    // Upsert the integration account
    const accountRow: Record<string, unknown> = {
      workspace_id: params.workspaceId,
      integration_id: params.integrationId,
      display_name: params.displayName ?? null,
      status: "active" as const,
      config: params.config,
      metadata: {},
    };

    const { data: account, error: accError } = await supabase
      .from("integration_accounts")
      .upsert(accountRow, {
        onConflict: "workspace_id,integration_id",
      })
      .select()
      .single();

    if (accError || !account) {
      logger.error("Failed to connect integration", {
        reason: accError?.message,
      });
      return {
        success: false,
        message: "Failed to connect integration.",
        error: accError?.message,
      };
    }

    await logIntegration({
      workspaceId: params.workspaceId,
      integrationId: params.integrationId,
      accountId: account.id,
      action: "connect",
      direction: "outbound",
      status: "success",
    });

    return {
      success: true,
      message: "Integration connected successfully.",
      data: account as IntegrationAccount,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to connect integration.";
    return { success: false, message, error: message };
  }
}

// ─── disconnectIntegration ─────────────────────────────────────

export async function disconnectIntegration(
  workspaceId: string,
  accountId: string
): Promise<ServiceResult<null>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    // Verify the account belongs to the workspace
    const { data: account, error: fetchError } = await supabase
      .from("integration_accounts")
      .select("id, integration_id")
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !account) {
      return {
        success: false,
        message: "Integration account not found.",
        error: fetchError?.message,
      };
    }

    // Delete OAuth tokens if any
    await supabase
      .from("oauth_tokens")
      .delete()
      .eq("integration_account_id", accountId);

    // Delete the account
    const { error: deleteError } = await supabase
      .from("integration_accounts")
      .delete()
      .eq("id", accountId);

    if (deleteError) {
      logger.error("Failed to disconnect integration", {
        reason: deleteError.message,
      });
      return {
        success: false,
        message: "Failed to disconnect integration.",
        error: deleteError.message,
      };
    }

    await logIntegration({
      workspaceId,
      integrationId: account.integration_id,
      action: "disconnect",
      direction: "outbound",
      status: "success",
    });

    return {
      success: true,
      message: "Integration disconnected successfully.",
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to disconnect integration.";
    return { success: false, message, error: message };
  }
}

// ─── updateIntegrationConfig ───────────────────────────────────

export async function updateIntegrationConfig(
  params: UpdateIntegrationConfigParams
): Promise<ServiceResult<IntegrationAccount>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "admin");

    const { data: account, error } = await supabase
      .from("integration_accounts")
      .update({
        config: params.config,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.accountId)
      .eq("workspace_id", params.workspaceId)
      .select()
      .single();

    if (error || !account) {
      logger.error("Failed to update integration config", {
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to update integration config.",
        error: error?.message,
      };
    }

    await logIntegration({
      workspaceId: params.workspaceId,
      accountId: params.accountId,
      action: "update_config",
      direction: "outbound",
      status: "success",
    });

    return {
      success: true,
      message: "Integration config updated.",
      data: account as IntegrationAccount,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to update integration config.";
    return { success: false, message, error: message };
  }
}

// ─── testConnection ────────────────────────────────────────────

export async function testConnection(
  workspaceId: string,
  accountId: string
): Promise<ServiceResult<{ latencyMs: number; statusCode?: number }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data: account, error: fetchError } = await supabase
      .from("integration_accounts")
      .select("id, integration_id, config")
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !account) {
      return {
        success: false,
        message: "Integration account not found.",
        error: fetchError?.message,
      };
    }

    const start = Date.now();
    let statusCode: number | undefined;
    let logStatus: "success" | "error" = "success";
    let errorMessage: string | undefined;

    try {
      // Attempt a basic health check by looking up the integration
      // and trying to validate the stored credentials.
      // Real implementations would make a provider-specific HTTP call.
      const { data: integration } = await supabase
        .from("integrations")
        .select("id, auth_type, provider")
        .eq("id", account.integration_id)
        .single();

      if (!integration) {
        throw new Error("Integration definition not found.");
      }

      // For OAuth-based integrations, verify a token exists
      if (integration.auth_type === "oauth") {
        const { data: token } = await supabase
          .from("oauth_tokens")
          .select("id, expires_at")
          .eq("integration_account_id", accountId)
          .single();
        if (!token) {
          throw new Error("No OAuth token found. Please re-authenticate.");
        }
        if (token.expires_at && new Date(token.expires_at) < new Date()) {
          throw new Error("OAuth token has expired. Please refresh.");
        }
      }

      statusCode = 200;
    } catch (healthErr) {
      logStatus = "error";
      errorMessage =
        healthErr instanceof Error ? healthErr.message : "Health check failed.";
    }

    const latencyMs = Date.now() - start;

    await logIntegration({
      workspaceId,
      integrationId: account.integration_id,
      accountId,
      action: "test_connection",
      direction: "outbound",
      status: logStatus,
      errorMessage,
      durationMs: latencyMs,
    });

    if (logStatus === "error") {
      return {
        success: false,
        message: errorMessage ?? "Connection test failed.",
        error: errorMessage,
      };
    }

    return {
      success: true,
      message: "Connection test passed.",
      data: { latencyMs, statusCode },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Connection test failed.";
    return { success: false, message, error: message };
  }
}

// ─── getIntegrationHealth ──────────────────────────────────────

export async function getIntegrationHealth(
  workspaceId: string,
  accountId: string
): Promise<ServiceResult<IntegrationHealth>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data: account, error: fetchError } = await supabase
      .from("integration_accounts")
      .select("id, status, last_used_at")
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !account) {
      return {
        success: false,
        message: "Integration account not found.",
        error: fetchError?.message,
      };
    }

    // Aggregate logs for this account
    const { data: logs, error: logsError } = await supabase
      .from("integration_logs")
      .select("status, duration_ms")
      .eq("account_id", accountId);

    if (logsError) {
      logger.error("Failed to fetch health logs", {
        reason: logsError.message,
      });
      return {
        success: false,
        message: "Failed to fetch integration health.",
        error: logsError.message,
      };
    }

    const logRows = logs ?? [];
    const errorCount = logRows.filter((l) => l.status === "error").length;
    const successCount = logRows.filter((l) => l.status === "success").length;
    const durations = logRows
      .map((l) => l.duration_ms)
      .filter((d): d is number => d !== null);
    const avgDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    const health: IntegrationHealth = {
      accountId: account.id,
      status: account.status,
      lastUsedAt: account.last_used_at,
      errorCount,
      successCount,
      avgDurationMs,
    };

    return {
      success: true,
      message: "Health data retrieved.",
      data: health,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get integration health.";
    return { success: false, message, error: message };
  }
}

// ─── listConnectedAccounts ─────────────────────────────────────

export async function listConnectedAccounts(
  workspaceId: string,
  category?: string
): Promise<ServiceResult<IntegrationWithAccount[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const accountQuery = supabase
      .from("integration_accounts")
      .select(`*, integrations(*)`)
      .eq("workspace_id", workspaceId);

    const { data: accounts, error } = await accountQuery;

    if (error) {
      logger.error("Failed to list connected accounts", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to list connected accounts.",
        error: error.message,
      };
    }

    let enriched = (accounts ?? []).map((row) => {
      const raw = row as Record<string, unknown>;
      const integration = raw.integrations as Integration | null;
      const { integrations: _, ...accountFields } = raw;
      return {
        ...(accountFields as IntegrationAccount),
        ...(integration ?? {}),
      } as unknown as IntegrationWithAccount;
    });

    if (category) {
      enriched = enriched.filter((item) => item.category === category);
    }

    return {
      success: true,
      message: `Found ${enriched.length} connected accounts.`,
      data: enriched,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to list connected accounts.";
    return { success: false, message, error: message };
  }
}

// ─── getIntegrationLogs ────────────────────────────────────────

export async function getIntegrationLogs(
  params: GetIntegrationLogsParams
): Promise<ServiceResult<IntegrationLog[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(params.workspaceId, profile.id);

    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let query = supabase
      .from("integration_logs")
      .select("*")
      .eq("workspace_id", params.workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.accountId) {
      query = query.eq("account_id", params.accountId);
    }
    if (params.action) {
      query = query.eq("action", params.action);
    }
    if (params.direction) {
      query = query.eq("direction", params.direction);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch integration logs", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to fetch integration logs.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Retrieved ${(data ?? []).length} log entries.`,
      data: (data ?? []) as IntegrationLog[],
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get integration logs.";
    return { success: false, message, error: message };
  }
}

// ─── getIntegrationPermissions ─────────────────────────────────

export async function getIntegrationPermissions(
  workspaceId: string,
  integrationId: string
): Promise<ServiceResult<IntegrationPermission>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data, error } = await supabase
      .from("integration_permissions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .single();

    if (error) {
      // No permissions record yet — return empty default
      if (error.code === "PGRST116") {
        return {
          success: true,
          message: "No permissions set.",
          data: {
            id: "",
            workspace_id: workspaceId,
            integration_id: integrationId,
            permissions: {},
            granted_by: null,
            granted_at: new Date().toISOString(),
            revoked_at: null,
          },
        };
      }
      logger.error("Failed to get integration permissions", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get integration permissions.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: "Permissions retrieved.",
      data: data as IntegrationPermission,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get integration permissions.";
    return { success: false, message, error: message };
  }
}

// ─── updateIntegrationPermissions ──────────────────────────────

export async function updateIntegrationPermissions(
  workspaceId: string,
  integrationId: string,
  permissions: Json
): Promise<ServiceResult<IntegrationPermission>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    // Upsert permissions
    const { data, error } = await supabase
      .from("integration_permissions")
      .upsert(
        {
          workspace_id: workspaceId,
          integration_id: integrationId,
          permissions,
          granted_by: profile.id,
          granted_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "workspace_id,integration_id" }
      )
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to update integration permissions", {
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to update integration permissions.",
        error: error?.message,
      };
    }

    return {
      success: true,
      message: "Permissions updated.",
      data: data as IntegrationPermission,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to update integration permissions.";
    return { success: false, message, error: message };
  }
}

// ─── getUsageAnalytics ─────────────────────────────────────────

export async function getUsageAnalytics(
  params: GetUsageAnalyticsParams
): Promise<ServiceResult<UsageStats>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(params.workspaceId, profile.id);

    const startDate = params.startDate;
    const endDate = params.endDate;

    const { data: logs, error } = await supabase
      .from("integration_logs")
      .select("*")
      .eq("workspace_id", params.workspaceId)
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (error) {
      logger.error("Failed to fetch usage analytics", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to fetch usage analytics.",
        error: error.message,
      };
    }

    const rows = logs ?? [];
    const totalCalls = rows.length;
    const successCalls = rows.filter((l) => l.status === "success").length;
    const errorCalls = rows.filter((l) => l.status === "error").length;
    const timeoutCalls = rows.filter((l) => l.status === "timeout").length;

    const durations = rows
      .map((l) => l.duration_ms)
      .filter((d): d is number => d !== null);
    const avgDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    // Aggregate by integration
    const integrationMap = new Map<
      string,
      {
        integrationId: string;
        integrationName: string;
        totalCalls: number;
        successCalls: number;
        errorCalls: number;
      }
    >();

    for (const row of rows) {
      if (!row.integration_id) continue;
      const existing = integrationMap.get(row.integration_id);
      if (existing) {
        existing.totalCalls++;
        if (row.status === "success") existing.successCalls++;
        if (row.status === "error") existing.errorCalls++;
      } else {
        integrationMap.set(row.integration_id, {
          integrationId: row.integration_id,
          integrationName: "unknown",
          totalCalls: 1,
          successCalls: row.status === "success" ? 1 : 0,
          errorCalls: row.status === "error" ? 1 : 0,
        });
      }
    }

    // Resolve integration names
    const integrationIds = [...integrationMap.keys()];
    let integrationNames: Map<string, string> = new Map();
    if (integrationIds.length > 0) {
      const { data: intData } = await supabase
        .from("integrations")
        .select("id, name")
        .in("id", integrationIds);
      if (intData) {
        integrationNames = new Map(intData.map((i) => [i.id, i.name]));
      }
    }

    const byIntegration = [...integrationMap.values()].map((entry) => ({
      ...entry,
      integrationName: integrationNames.get(entry.integrationId) ?? "unknown",
    }));

    // Aggregate by action
    const actionMap = new Map<
      string,
      { action: string; totalCalls: number; successCalls: number; errorCalls: number }
    >();

    for (const row of rows) {
      const existing = actionMap.get(row.action);
      if (existing) {
        existing.totalCalls++;
        if (row.status === "success") existing.successCalls++;
        if (row.status === "error") existing.errorCalls++;
      } else {
        actionMap.set(row.action, {
          action: row.action,
          totalCalls: 1,
          successCalls: row.status === "success" ? 1 : 0,
          errorCalls: row.status === "error" ? 1 : 0,
        });
      }
    }

    const byAction = [...actionMap.values()];

    const stats: UsageStats = {
      totalCalls,
      successCalls,
      errorCalls,
      timeoutCalls,
      avgDurationMs,
      byIntegration,
      byAction,
    };

    return {
      success: true,
      message: "Usage analytics retrieved.",
      data: stats,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get usage analytics.";
    return { success: false, message, error: message };
  }
}

// ─── refreshIntegrationToken ───────────────────────────────────

export async function refreshIntegrationToken(
  workspaceId: string,
  accountId: string
): Promise<ServiceResult<{ refreshed: boolean }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    // Verify the account belongs to the workspace
    const { data: account, error: accError } = await supabase
      .from("integration_accounts")
      .select("id, integration_id")
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .single();

    if (accError || !account) {
      return {
        success: false,
        message: "Integration account not found.",
        error: accError?.message,
      };
    }

    // Check for an existing OAuth token
    const { data: token, error: tokenError } = await supabase
      .from("oauth_tokens")
      .select("id, provider, refresh_token, expires_at")
      .eq("integration_account_id", accountId)
      .single();

    if (tokenError || !token) {
      return {
        success: false,
        message: "No OAuth token found for this integration.",
        error: tokenError?.message,
      };
    }

    if (!token.refresh_token) {
      return {
        success: false,
        message: "No refresh token available. Please re-authenticate.",
      };
    }

    // Delegate to OAuth manager for the actual refresh
    const { refreshOAuthToken } = await import("./oauth-manager");
    const refreshResult = await refreshOAuthToken(accountId);

    if (!refreshResult.success) {
      await logIntegration({
        workspaceId,
        integrationId: account.integration_id,
        accountId,
        action: "refresh_token",
        direction: "outbound",
        status: "error",
        errorMessage: refreshResult.error,
      });

      return {
        success: false,
        message: refreshResult.message,
        error: refreshResult.error,
      };
    }

    // Update last_used_at
    await supabase
      .from("integration_accounts")
      .update({
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    await logIntegration({
      workspaceId,
      integrationId: account.integration_id,
      accountId,
      action: "refresh_token",
      direction: "outbound",
      status: "success",
    });

    return {
      success: true,
      message: "Token refreshed successfully.",
      data: { refreshed: true },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to refresh token.";
    return { success: false, message, error: message };
  }
}

// ─── getIntegrationAccountClient ───────────────────────────────

export async function getIntegrationAccountClient(
  workspaceId: string,
  accountId: string
): Promise<ServiceResult<{ supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer U> ? U : never; credentials: Record<string, unknown> }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data: account, error: accError } = await supabase
      .from("integration_accounts")
      .select("id, integration_id, config, status")
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .single();

    if (accError || !account) {
      return {
        success: false,
        message: "Integration account not found.",
        error: accError?.message,
      };
    }

    if (account.status !== "active") {
      return {
        success: false,
        message: `Integration account is ${account.status}.`,
      };
    }

    // For OAuth integrations, check and decrypt token
    const { data: integration } = await supabase
      .from("integrations")
      .select("id, auth_type")
      .eq("id", account.integration_id)
      .single();

    const credentials: Record<string, unknown> = {
      ...((account.config as Record<string, unknown>) ?? {}),
    };

    if (integration?.auth_type === "oauth") {
      const { data: token } = await supabase
        .from("oauth_tokens")
        .select("access_token, expires_at")
        .eq("integration_account_id", accountId)
        .single();

      if (!token) {
        return {
          success: false,
          message: "No OAuth token found. Please re-authenticate.",
        };
      }

      if (token.expires_at && new Date(token.expires_at) < new Date()) {
        return {
          success: false,
          message: "OAuth token expired. Please refresh.",
        };
      }

      credentials.access_token = token.access_token;
    }

    // Update last_used_at
    await supabase
      .from("integration_accounts")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", accountId);

    return {
      success: true,
      message: "Client configured.",
      data: { supabase, credentials },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get account client.";
    return { success: false, message, error: message };
  }
}

/* eslint-disable @typescript-eslint/no-require-imports */
// ─── Webhook wrappers (dynamic require to avoid Turbopack tracing crypto modules) ──
export async function createWebhook(...args: Parameters<typeof import("./webhook-engine").createWebhook>) {
  const m = require("./webhook-engine");
  return m.createWebhook(...args);
}
export async function listWebhooks(...args: Parameters<typeof import("./webhook-engine").listWebhooks>) {
  const m = require("./webhook-engine");
  return m.listWebhooks(...args);
}
export async function getWebhook(...args: Parameters<typeof import("./webhook-engine").getWebhook>) {
  const m = require("./webhook-engine");
  return m.getWebhook(...args);
}
export async function updateWebhook(...args: Parameters<typeof import("./webhook-engine").updateWebhook>) {
  const m = require("./webhook-engine");
  return m.updateWebhook(...args);
}
export async function deleteWebhook(...args: Parameters<typeof import("./webhook-engine").deleteWebhook>) {
  const m = require("./webhook-engine");
  return m.deleteWebhook(...args);
}
export async function testWebhook(...args: Parameters<typeof import("./webhook-engine").testWebhook>) {
  const m = require("./webhook-engine");
  return m.testWebhook(...args);
}
export async function getWebhookEvents(...args: Parameters<typeof import("./webhook-engine").getWebhookEvents>) {
  const m = require("./webhook-engine");
  return m.getWebhookEvents(...args);
}
export async function retryWebhookEvent(...args: Parameters<typeof import("./webhook-engine").retryWebhookEvent>) {
  const m = require("./webhook-engine");
  return m.retryWebhookEvent(...args);
}
export async function getWebhookStats(...args: Parameters<typeof import("./webhook-engine").getWebhookStats>) {
  const m = require("./webhook-engine");
  return m.getWebhookStats(...args);
}

// ─── OAuth wrappers (dynamic import) ──
export async function initiateOAuthFlow(...args: Parameters<typeof import("./oauth-manager").initiateOAuthFlow>) {
  const m = require("./oauth-manager");
  return m.initiateOAuthFlow(...args);
}
export async function handleOAuthCallback(...args: Parameters<typeof import("./oauth-manager").handleOAuthCallback>) {
  const m = require("./oauth-manager");
  return m.handleOAuthCallback(...args);
}
export async function refreshOAuthToken(...args: Parameters<typeof import("./oauth-manager").refreshOAuthToken>) {
  const m = require("./oauth-manager");
  return m.refreshOAuthToken(...args);
}
export async function revokeOAuthToken(...args: Parameters<typeof import("./oauth-manager").revokeOAuthToken>) {
  const m = require("./oauth-manager");
  return m.revokeOAuthToken(...args);
}
export async function getOAuthStatus(...args: Parameters<typeof import("./oauth-manager").getOAuthStatus>) {
  const m = require("./oauth-manager");
  return m.getOAuthStatus(...args);
}

// ─── API Key wrappers (dynamic import) ──
export async function createApiKey(...args: Parameters<typeof import("./api-key-manager").createApiKey>) {
  const m = require("./api-key-manager");
  return m.createApiKey(...args);
}
export async function listApiKeys(...args: Parameters<typeof import("./api-key-manager").listApiKeys>) {
  const m = require("./api-key-manager");
  return m.listApiKeys(...args);
}
export async function getApiKey(...args: Parameters<typeof import("./api-key-manager").getApiKey>) {
  const m = require("./api-key-manager");
  return m.getApiKey(...args);
}
export async function revokeApiKey(...args: Parameters<typeof import("./api-key-manager").revokeApiKey>) {
  const m = require("./api-key-manager");
  return m.revokeApiKey(...args);
}
export async function rotateApiKey(...args: Parameters<typeof import("./api-key-manager").rotateApiKey>) {
  const m = require("./api-key-manager");
  return m.rotateApiKey(...args);
}
export async function validateApiKey(...args: Parameters<typeof import("./api-key-manager").validateApiKey>) {
  const m = require("./api-key-manager");
  return m.validateApiKey(...args);
}
export async function incrementKeyUsage(...args: Parameters<typeof import("./api-key-manager").incrementKeyUsage>) {
  const m = require("./api-key-manager");
  return m.incrementKeyUsage(...args);
}
export async function getApiKeyUsage(...args: Parameters<typeof import("./api-key-manager").getApiKeyUsage>) {
  const m = require("./api-key-manager");
  return m.getApiKeyUsage(...args);
}
