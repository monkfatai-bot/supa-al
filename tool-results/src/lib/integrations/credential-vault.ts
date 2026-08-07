/**
 * Supa AI — Phase 10 Integration Hub — Credential Vault.
 *
 * Server-only store for integration secrets (OAuth tokens, API keys,
 * webhook secrets, client secrets, etc.). Every value is encrypted at
 * rest with AES-256-GCM via `@/lib/security/crypto` (the project-wide
 * field-level crypto layer).
 *
 * The vault never returns encrypted text to the client — only stored
 * metadata. Plaintext is decrypted in-process on demand for outbound
 * calls (sync, webhook delivery, OAuth refresh).
 *
 * @module @/lib/integrations/credential-vault
 */
import "server-only";

import { randomBytes } from "node:crypto";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { decrypt, encrypt } from "@/lib/security/crypto";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/types";

import { toDbError, wrapIntegrationError } from "./core";
import type {
  CredentialType,
  IntegrationCredential,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEY_VERSION = 1;
const WEBHOOK_SECRET_BYTES = 32;

interface StoreCredentialInput {
  integrationId: string;
  workspaceId: string;
  type: CredentialType;
  /** Plaintext value to encrypt. */
  value: string;
  expiresAt?: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

interface StoreOAuthTokensInput {
  integrationId: string;
  workspaceId: string;
  accessToken: string;
  refreshToken?: string;
  /** Seconds until the access token expires. */
  expiresInSec?: number;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

/** Decrypted credential returned to callers that need plaintext. */
export interface DecryptedCredential {
  id: string;
  integrationId: string;
  type: CredentialType;
  value: string;
  expiresAt: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
  keyVersion: number;
  lastRotatedAt: string | null;
}

// ---------------------------------------------------------------------------
// CredentialVault
// ---------------------------------------------------------------------------

/**
 * Server-only vault for integration secrets. Constructed with the admin
 * Supabase client so it can read/write every workspace's credentials.
 * Mutations are still gated at the service layer on workspace membership.
 *
 * Use {@link getCredentialVault} (the singleton factory) — never `new`
 * it directly outside tests.
 */
export class CredentialVault {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Store a single encrypted credential for an integration. Replaces
   * any existing credential of the same `(integrationId, type)` pair
   * by deleting it first (one row per type per integration is the
   * canonical shape).
   */
  async store(input: StoreCredentialInput): Promise<IntegrationCredential> {
    try {
      // Delete existing credential of the same type for this integration.
      await this.supabase
        .from("integration_credentials")
        .delete()
        .eq("integration_id", input.integrationId)
        .eq("type", input.type);

      const row: TablesInsert<"integration_credentials"> = {
        integration_id: input.integrationId,
        workspace_id: input.workspaceId,
        type: input.type,
        encrypted_value: encrypt(input.value),
        key_version: KEY_VERSION,
        expires_at: input.expiresAt ?? null,
        scopes: (input.scopes ?? []) as unknown as TablesInsert<"integration_credentials">["scopes"],
        metadata: (input.metadata ?? {}) as unknown as TablesInsert<"integration_credentials">["metadata"],
        last_rotated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from("integration_credentials")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "credentialVault.store failed");
      if (!data) throw new DatabaseError("credentialVault.store returned no row.");
      return data as unknown as IntegrationCredential;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure storing credential.", {
        integrationId: input.integrationId,
        type: input.type,
      });
    }
  }

  /**
   * Store both an access token + refresh token for an OAuth2 integration.
   * Convenience wrapper around {@link store} for the common OAuth2 case.
   */
  async storeOAuthTokens(input: StoreOAuthTokensInput): Promise<void> {
    try {
      const accessTokenExpiresAt = input.expiresInSec
        ? new Date(Date.now() + input.expiresInSec * 1000).toISOString()
        : null;

      await this.store({
        integrationId: input.integrationId,
        workspaceId: input.workspaceId,
        type: "oauth_access_token",
        value: input.accessToken,
        expiresAt: accessTokenExpiresAt,
        scopes: input.scopes,
        metadata: input.metadata,
      });

      if (input.refreshToken) {
        await this.store({
          integrationId: input.integrationId,
          workspaceId: input.workspaceId,
          type: "oauth_refresh_token",
          value: input.refreshToken,
          expiresAt: null,
          scopes: input.scopes,
          metadata: input.metadata,
        });
      }
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure storing OAuth tokens.", {
        integrationId: input.integrationId,
      });
    }
  }

  /**
   * Fetch + decrypt the credential of `type` for `integrationId`.
   * Returns `null` when no such credential exists. Throws when the
   * stored ciphertext has been tampered with (GCM auth tag mismatch).
   */
  async getDecrypted(
    integrationId: string,
    type: CredentialType,
  ): Promise<DecryptedCredential | null> {
    try {
      const { data, error } = await this.supabase
        .from("integration_credentials")
        .select()
        .eq("integration_id", integrationId)
        .eq("type", type)
        .maybeSingle();
      if (error) throw toDbError(error, "credentialVault.getDecrypted failed");
      if (!data) return null;

      return this.toDecrypted(data as unknown as IntegrationCredential);
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure decrypting credential.", {
        integrationId,
        type,
      });
    }
  }

  /**
   * Fetch + decrypt every credential for `integrationId`. Returns a
   * map keyed by {@link CredentialType}. Useful for outbound calls
   * that need to consult multiple secrets at once (e.g. OAuth access
   * + refresh + client_secret).
   */
  async getDecryptedCredentials(
    integrationId: string,
  ): Promise<Partial<Record<CredentialType, DecryptedCredential>>> {
    try {
      const { data, error } = await this.supabase
        .from("integration_credentials")
        .select()
        .eq("integration_id", integrationId);
      if (error) throw toDbError(error, "credentialVault.getDecryptedCredentials failed");
      if (!data || data.length === 0) return {};

      const out: Partial<Record<CredentialType, DecryptedCredential>> = {};
      for (const row of data as unknown as IntegrationCredential[]) {
        const decrypted = this.toDecrypted(row);
        out[decrypted.type] = decrypted;
      }
      return out;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure decrypting credentials.", {
        integrationId,
      });
    }
  }

  /**
   * Delete a single credential by id.
   */
  async delete(credentialId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("integration_credentials")
        .delete()
        .eq("id", credentialId);
      if (error) throw toDbError(error, "credentialVault.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure deleting credential.", {
        credentialId,
      });
    }
  }

  /**
   * Delete every credential for `integrationId`. Used during disconnect.
   */
  async deleteAll(integrationId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from("integration_credentials")
        .delete()
        .eq("integration_id", integrationId)
        .select("id");
      if (error) throw toDbError(error, "credentialVault.deleteAll failed");
      return data?.length ?? 0;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure deleting all credentials.", {
        integrationId,
      });
    }
  }

  /**
   * Rotate every stored credential's encryption by re-encrypting each
   * value with the current key. Used after an `ENCRYPTION_KEY` rotation
   * to upgrade old ciphertexts. Returns the number of credentials
   * re-encrypted.
   */
  async rotateAllKeys(): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from("integration_credentials")
        .select("id, encrypted_value, key_version")
        .range(0, 999);
      if (error) throw toDbError(error, "credentialVault.rotateAllKeys failed");
      if (!data || data.length === 0) return 0;

      let rotated = 0;
      for (const row of data) {
        const r = row as unknown as {
          id: string;
          encrypted_value: string;
          key_version: number;
        };
        try {
          const plaintext = decrypt(r.encrypted_value);
          const reencrypted = encrypt(plaintext);
          const { error: updateError } = await this.supabase
            .from("integration_credentials")
            .update({
              encrypted_value: reencrypted,
              key_version: KEY_VERSION,
              last_rotated_at: new Date().toISOString(),
            } as never)
            .eq("id", r.id);
          if (updateError) {
            logger.warn("credentialVault.rotateAllKeys: row update failed", {
              credentialId: r.id,
              error: String(updateError),
            });
            continue;
          }
          rotated += 1;
        } catch (err) {
          logger.warn("credentialVault.rotateAllKeys: decrypt failed", {
            credentialId: r.id,
            error: String(err),
          });
        }
      }
      return rotated;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure rotating credentials.");
    }
  }

  /**
   * Generate a cryptographically-strong random webhook signing secret.
   * Used by {@link WebhookManager.createSubscription}.
   */
  generateWebhookSecret(): string {
    return randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private toDecrypted(row: IntegrationCredential): DecryptedCredential {
    let value: string;
    try {
      value = decrypt(row.encrypted_value);
    } catch (err) {
      const appErr = toAppError(err);
      throw new DatabaseError("Failed to decrypt credential value.", {
        credentialId: row.id,
        cause: appErr.message,
      });
    }
    return {
      id: row.id,
      integrationId: row.integration_id,
      type: row.type,
      value,
      expiresAt: row.expires_at,
      scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {},
      keyVersion: row.key_version,
      lastRotatedAt: row.last_rotated_at,
    };
  }
}

/**
 * Singleton credential vault. Constructed lazily on first access.
 */
let _vault: CredentialVault | null = null;

/** Get the shared credential vault (singleton). */
export function getCredentialVault(): CredentialVault {
  if (_vault) return _vault;
  _vault = new CredentialVault(createSupabaseAdminClient());
  return _vault;
}

/** Get a credential vault bound to a specific admin client (tests / DI). */
export function getCredentialVaultWith(supabase: AdminSupabaseClient): CredentialVault {
  return new CredentialVault(supabase);
}

// Re-export the missing NotFoundError for callers that want it in one import.
export { NotFoundError };
