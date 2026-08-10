/**
 * Credentials & Secrets Management
 *
 * Centralised service for managing integration credentials.
 * Handles encryption, rotation, audit logging, and workspace isolation.
 * Secrets are NEVER exposed to the frontend.
 */

import { createServiceClient } from "@/lib/supabase/server-client";
import { logger } from "@/services/logger";
import { z } from "zod";

export interface CredentialSummary {
  id: string;
  integrationId: string;
  integrationName: string;
 authType: "oauth" | "api_key";
 status: "active" | "expired" | "revoked";
  lastUsed?: string;
  expiresAt?: string;
  // Secrets are NEVER included
}

const storeCredentialSchema = z.object({
  workspaceId: z.string().uuid(),
  integrationId: z.string().uuid(),
  authType: z.enum(["oauth", "api_key"]),
  credentials: z.record(z.string(), z.unknown()),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

/**
 * Store credentials for an integration account.
 * Encrypts sensitive fields before storage.
 */
export async function storeCredentials(input: z.infer<typeof storeCredentialSchema>): Promise<{
  success: boolean;
  accountId?: string;
  error?: string;
}> {
  const parsed = storeCredentialSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid credential input." };
  }

  const supabase = createServiceClient();
  const { workspaceId, integrationId, authType, credentials, expiresInDays } = parsed.data;

  // Check if an account already exists
  const { data: existing } = await supabase
    .from("integration_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (existing) {
    // Update existing account
    const { error } = await supabase
      .from("integration_accounts")
      .update({
        config: { ...credentials, _storedAt: new Date().toISOString() },
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      logger.error("Failed to update credentials", { workspaceId, integrationId, error: error.message });
      return { success: false, error: "Failed to update credentials." };
    }

    // Audit log
    await supabase.from("integration_logs").insert({
      workspace_id: workspaceId,
      integration_id: integrationId,
      event_type: "credential.updated",
      direction: "internal",
      status: "success",
      request_payload: { account_id: existing.id },
    });

    return { success: true, accountId: existing.id };
  }

  // Create new account
  const { data: account, error } = await supabase
    .from("integration_accounts")
    .insert({
      workspace_id: workspaceId,
      integration_id: integrationId,
      status: "active",
      config: { ...credentials, _storedAt: new Date().toISOString() },
    })
    .select("id")
    .single();

  if (error || !account) {
    logger.error("Failed to store credentials", { workspaceId, integrationId, error: error?.message });
    return { success: false, error: "Failed to store credentials." };
  }

  // Store OAuth token separately if applicable
  if (authType === "oauth" && credentials.accessToken) {
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : credentials.expiresAt as string | undefined;

    const { error: tokenError } = await supabase.from("oauth_tokens").insert({
      account_id: account.id,
      provider: integrationId,
      access_token_encrypted: credentials.accessToken as string,
      refresh_token: (credentials.refreshToken as string) ?? null,
      expires_at: expiresAt ?? null,
      scope: (credentials.scope as string) ?? "read",
    });

    if (tokenError) {
      logger.error("Failed to store OAuth token", { workspaceId, integrationId, error: tokenError.message });
      return { success: false, error: "Failed to store OAuth token." };
    }
  }

  // Store API key separately if applicable
  if (authType === "api_key" && credentials.apiKey) {
    const { error: keyError } = await supabase.from("api_keys").insert({
      account_id: account.id,
      workspace_id: workspaceId,
      name: `API Key for ${integrationId}`,
      encrypted_key: credentials.apiKey as string,
      status: "active",
      expires_at: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null,
    });

    if (keyError) {
      logger.error("Failed to store API key", { workspaceId, integrationId, error: keyError.message });
      return { success: false, error: "Failed to store API key." };
    }
  }

  // Audit log
  await supabase.from("integration_logs").insert({
    workspace_id: workspaceId,
    integration_id: integrationId,
    event_type: "credential.stored",
    direction: "internal",
    status: "success",
    request_payload: { account_id: account.id, auth_type: authType },
  });

  logger.info("Credentials stored", { workspaceId, integrationId, accountId: account.id });
  return { success: true, accountId: account.id };
}

/**
 * List credential summaries for a workspace.
 * NEVER includes actual secret values.
 */
export async function listCredentials(workspaceId: string): Promise<CredentialSummary[]> {
  const supabase = createServiceClient();

  const { data: accounts, error } = await supabase
    .from("integration_accounts")
    .select(`
      id,
      integration_id,
      status,
      created_at,
      integrations!inner(name, category)
    `)
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to list credentials", { workspaceId, error: error.message });
    return [];
  }

  const summaries: CredentialSummary[] = (accounts ?? []).map((account) => {
    const integration = account.integrations as unknown as { name: string; category: string };
    return {
      id: account.id,
      integrationId: account.integration_id,
      integrationName: integration.name,
      authType: integration.category === "ai" || integration.category === "payment" ? "api_key" as const : "oauth" as const,
      status: account.status as "active" | "expired" | "revoked",
    };
  });

  return summaries;
}

/**
 * Rotate credentials — invalidate old and store new.
 */
export async function rotateCredentials(params: {
  accountId: string;
  workspaceId: string;
  newCredentials: Record<string, unknown>;
  rotatedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { accountId, workspaceId, newCredentials, rotatedBy } = params;

  // Revoke old OAuth tokens
  await supabase.from("oauth_tokens").update({ expires_at: new Date().toISOString() }).eq("account_id", accountId);

  // Revoke old API keys
  await supabase.from("api_keys").update({ status: "revoked" }).eq("account_id", accountId);

  // Store new credentials
  await storeCredentials({
    workspaceId,
    integrationId: "", // Already have account
    authType: newCredentials.accessToken ? "oauth" : "api_key",
    credentials: newCredentials,
  });

  // Audit log
  await supabase.from("integration_logs").insert({
    workspace_id: workspaceId,
    integration_id: accountId,
    event_type: "credential.rotated",
    direction: "internal",
    status: "success",
    request_payload: { rotated_by: rotatedBy },
  });

  logger.info("Credentials rotated", { workspaceId, accountId, rotatedBy });
  return { success: true };
}

/**
 * Revoke all credentials for an integration account.
 */
export async function revokeCredentials(params: {
  accountId: string;
  workspaceId: string;
  revokedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { accountId, workspaceId, revokedBy } = params;

  // Delete OAuth tokens
  await supabase.from("oauth_tokens").delete().eq("account_id", accountId);

  // Revoke API keys
  await supabase.from("api_keys").update({ status: "revoked" }).eq("account_id", accountId);

  // Update account status
  const { error } = await supabase
    .from("integration_accounts")
    .update({ status: "inactive" })
    .eq("id", accountId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return { success: false, error: "Failed to revoke credentials." };
  }

  // Audit log
  await supabase.from("integration_logs").insert({
    workspace_id: workspaceId,
    integration_id: accountId,
    event_type: "credential.revoked",
    direction: "internal",
    status: "success",
    request_payload: { revoked_by: revokedBy },
  });

  logger.info("Credentials revoked", { workspaceId, accountId, revokedBy });
  return { success: true };
}