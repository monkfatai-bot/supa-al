/**
 * Integration Versioning Service
 *
 * Tracks version history for integration configurations,
 * supports rollback, and maintains a changelog per integration account.
 */

import { createServiceClient } from "@/lib/supabase/server-client";
import { logger } from "@/services/logger";
import { z } from "zod";

const createVersionSchema = z.object({
  accountId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  changeDescription: z.string().min(1).max(500),
  previousConfig: z.record(z.string(), z.unknown()).optional(),
  newConfig: z.record(z.string(), z.unknown()).optional(),
  changedBy: z.string().uuid(),
});

export interface IntegrationVersion {
  id: string;
  account_id: string;
  workspace_id: string;
  version_number: number;
  change_description: string;
  previous_config: Record<string, unknown> | null;
  new_config: Record<string, unknown> | null;
  changed_by: string;
  created_at: string;
}

/**
 * Record a new version snapshot when integration config changes.
 */
export async function recordVersion(input: z.infer<typeof createVersionSchema>): Promise<{ success: boolean; version?: IntegrationVersion; error?: string }> {
  const parsed = createVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid version input." };
  }

  const supabase = createServiceClient();
  const { accountId, workspaceId, changeDescription, previousConfig, newConfig, changedBy } = parsed.data;

  // Get the next version number
  const { data: lastVersion, error: versionError } = await supabase
    .from("integration_logs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("integration_id", accountId)
    .like("event_type", "config.version.%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) {
    logger.error("Failed to query version history", { workspaceId, accountId, error: versionError.message });
    return { success: false, error: "Failed to query version history." };
  }

  // We use integration_logs as the version store (no separate table needed)
  // The event_type format is "config.version.{N}"
  const versionNumber = (lastVersion ? 1 : 0) + 1;

  const { error: insertError } = await supabase.from("integration_logs").insert({
    workspace_id: workspaceId,
    integration_id: accountId,
    event_type: `config.version.${versionNumber}`,
    direction: "internal" as const,
    status: "success" as const,
    request_payload: {
      version_number: versionNumber,
      change_description: changeDescription,
      previous_config: previousConfig ?? null,
      new_config: newConfig ?? null,
      changed_by: changedBy,
    },
  });

  if (insertError) {
    logger.error("Failed to record integration version", { workspaceId, accountId, error: insertError.message });
    return { success: false, error: "Failed to record version." };
  }

  logger.info("Integration version recorded", { workspaceId, accountId, versionNumber });

  return {
    success: true,
    version: {
      id: `v${versionNumber}`,
      account_id: accountId,
      workspace_id: workspaceId,
      version_number: versionNumber,
      change_description: changeDescription,
      previous_config: (previousConfig as Record<string, unknown> | null) ?? null,
      new_config: (newConfig as Record<string, unknown> | null) ?? null,
      changed_by: changedBy,
      created_at: new Date().toISOString(),
    },
  };
}

/**
 * Get version history for an integration account.
 */
export async function getVersionHistory(params: {
  accountId: string;
  workspaceId: string;
  limit?: number;
  offset?: number;
}): Promise<{ success: boolean; data?: IntegrationVersion[]; total?: number; error?: string }> {
  const supabase = createServiceClient();
  const { accountId, workspaceId, limit = 20, offset = 0 } = params;

  const { data, error, count } = await supabase
    .from("integration_logs")
    .select("id, created_at, request_payload", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("integration_id", accountId)
    .like("event_type", "config.version.%")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error("Failed to fetch version history", { workspaceId, accountId, error: error.message });
    return { success: false, error: "Failed to fetch version history." };
  }

  const versions: IntegrationVersion[] = (data ?? []).map((row) => {
    const payload = (row.request_payload as Record<string, unknown>) ?? {};
    return {
      id: row.id,
      account_id: accountId,
      workspace_id: workspaceId,
      version_number: (payload.version_number as number) ?? 0,
      change_description: (payload.change_description as string) ?? "",
      previous_config: (payload.previous_config as Record<string, unknown> | null) ?? null,
      new_config: (payload.new_config as Record<string, unknown> | null) ?? null,
      changed_by: (payload.changed_by as string) ?? "",
      created_at: row.created_at,
    };
  });

  return { success: true, data: versions, total: count ?? 0 };
}

/**
 * Rollback an integration account's config to a specific version.
 */
export async function rollbackToVersion(params: {
  accountId: string;
  workspaceId: string;
  versionNumber: number;
  performedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { accountId, workspaceId, versionNumber, performedBy } = params;

  // Find the target version
  const { data: versionEntry, error } = await supabase
    .from("integration_logs")
    .select("request_payload")
    .eq("workspace_id", workspaceId)
    .eq("integration_id", accountId)
    .eq("event_type", `config.version.${versionNumber}`)
    .single();

  if (error || !versionEntry) {
    return { success: false, error: `Version ${versionNumber} not found.` };
  }

  const payload = versionEntry.request_payload as Record<string, unknown>;
  const targetConfig = payload.new_config as Record<string, unknown> | null;

  if (!targetConfig) {
    return { success: false, error: "Target version has no configuration snapshot." };
  }

  // Get current config
  const { data: account } = await supabase
    .from("integration_accounts")
    .select("config")
    .eq("id", accountId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!account) {
    return { success: false, error: "Integration account not found." };
  }

  // Apply rollback
  const { error: updateError } = await supabase
    .from("integration_accounts")
    .update({ config: targetConfig })
    .eq("id", accountId)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    logger.error("Failed to rollback integration config", { accountId, versionNumber, error: updateError.message });
    return { success: false, error: "Failed to apply rollback." };
  }

  // Record the rollback as a new version
  await recordVersion({
    accountId,
    workspaceId,
    changeDescription: `Rollback to version ${versionNumber}`,
    previousConfig: (account.config as Record<string, unknown>) ?? {},
    newConfig: targetConfig,
    changedBy: performedBy,
  });

  logger.info("Integration config rolled back", { workspaceId, accountId, versionNumber });
  return { success: true };
}
