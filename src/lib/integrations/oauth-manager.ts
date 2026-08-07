/**
 * Supa AI — Phase 10 Integration Hub — OAuth2 Manager.
 *
 * Server-only helper that orchestrates the OAuth2 Authorization-Code
 * flow for connectors that require it (Slack, GitHub, Google, etc.).
 *
 * State is stored in Redis (with an in-memory fallback) so the callback
 * can verify the round-trip without persisting sensitive `state` values
 * to the database. Tokens (access + refresh) are stored encrypted via
 * {@link CredentialVault}.
 *
 * @module @/lib/integrations/oauth-manager
 */
import "server-only";

import { randomBytes } from "node:crypto";

import { logger } from "@/lib/logger";
import { getStore } from "@/lib/redis";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import { getCredentialVault } from "./credential-vault";
import { connectorRegistry } from "./connectors/registry";
import { computeRetryDelay, isoInFuture, toDbError, wrapIntegrationError } from "./core";
import { IntegrationEvents, eventBus } from "./event-bus";
import type {
  Integration,
  OAuthCallbackResult,
  OAuthInitiateResult,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_BYTES = 16;
const STATE_TTL_SEC = 10 * 60; // 10 minutes
const STATE_KEY_PREFIX = "p10:oauth:state:";
const REFRESH_SKEW_SEC = 60 * 5; // refresh 5 minutes before expiry

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersistedState {
  state: string;
  workspaceId: string;
  userId: string;
  connectorKey: string;
  integrationId?: string;
  redirectUri: string;
  scopes: string[];
  createdAt: string;
}

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

// ---------------------------------------------------------------------------
// OAuthManager
// ---------------------------------------------------------------------------

/**
 * Server-only OAuth2 orchestrator. Construct via {@link getOAuthManager}
 * (singleton) or {@link getOAuthManagerWith} (DI for tests).
 */
export class OAuthManager {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Initiate the OAuth2 Authorization-Code flow. Generates a `state`
   * nonce, persists it (Redis) with the caller context, and returns the
   * provider authorization URL the browser should redirect to.
   */
  async initiate(input: {
    workspaceId: string;
    userId: string;
    connectorKey: string;
    redirectUri: string;
    integrationId?: string;
    scopes?: string[];
  }): Promise<OAuthInitiateResult> {
    const connector = connectorRegistry.require(input.connectorKey);
    const def = connector.getDefinition();
    if (def.authType !== "oauth2") {
      throw new Error(`Connector ${input.connectorKey} is not OAuth2.`);
    }

    const state = randomBytes(STATE_BYTES).toString("hex");
    const persisted: PersistedState = {
      state,
      workspaceId: input.workspaceId,
      userId: input.userId,
      connectorKey: input.connectorKey,
      integrationId: input.integrationId,
      redirectUri: input.redirectUri,
      scopes: input.scopes ?? (def.requiredScopes ?? []),
      createdAt: new Date().toISOString(),
    };

    const store = getStore();
    await store.set(`${STATE_KEY_PREFIX}${state}`, persisted, STATE_TTL_SEC);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: connector.getClientId(),
      redirect_uri: input.redirectUri,
      state,
      scope: persisted.scopes.join(" "),
    });
    const authorizationUrl = `${connector.getAuthorizeUrl()}?${params.toString()}`;

    return {
      authorizationUrl,
      state,
      redirectUri: input.redirectUri,
      connectorKey: input.connectorKey,
    };
  }

  /**
   * Handle the OAuth2 callback. Verifies the `state` nonce, exchanges
   * the authorization code for an access token, persists the tokens via
   * the credential vault, and links them to the integration row. Creates
   * the integration row when `integrationId` was not yet known.
   */
  async handleCallback(input: {
    code: string;
    state: string;
  }): Promise<OAuthCallbackResult> {
    const store = getStore();
    const persistedRaw = await store.get(`${STATE_KEY_PREFIX}${input.state}`);
    if (!persistedRaw) {
      throw new Error("OAuth state expired or invalid. Please retry.");
    }
    await store.del(`${STATE_KEY_PREFIX}${input.state}`);

    const persisted = persistedRaw as PersistedState;
    const connector = connectorRegistry.require(persisted.connectorKey);

    let tokens: TokenSet;
    try {
      tokens = await connector.exchangeCodeForTokens(
        input.code,
        persisted.redirectUri,
      );
    } catch (err) {
      logger.error("oauth-manager: token exchange failed", {
        connectorKey: persisted.connectorKey,
        error: String(err),
      });
      throw new Error("OAuth token exchange failed.");
    }

    // Find or create the integration row.
    let integrationId = persisted.integrationId;
    if (!integrationId) {
      const { data, error } = await this.supabase
        .from("integrations")
        .insert({
          workspace_id: persisted.workspaceId,
          connector_key: persisted.connectorKey,
          name: connector.getDefinition().name,
          status: "connected",
          auth_type: "oauth2",
          installed_by: persisted.userId,
          capabilities: (connector.getDefinition().capabilities ?? []) as unknown as Integration["capabilities"],
        } as never)
        .select()
        .single();
      if (error) throw toDbError(error, "oauth.handleCallback: create integration failed");
      integrationId = (data as unknown as Integration).id;
    } else {
      // Update existing integration's status to connected.
      await this.supabase
        .from("integrations")
        .update({
          status: "connected",
          last_error: null,
          error_count: 0,
        } as never)
        .eq("id", integrationId);
    }

    const vault = getCredentialVault();
    await vault.storeOAuthTokens({
      integrationId,
      workspaceId: persisted.workspaceId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSec: tokens.expires_in,
      scopes: tokens.scope ? tokens.scope.split(" ") : persisted.scopes,
      metadata: { token_type: tokens.token_type ?? "Bearer" },
    });

    void eventBus.publish({
      workspaceId: persisted.workspaceId,
      source: "oauth-manager",
      type: IntegrationEvents.integrationConnected,
      category: "integration",
      payload: {
        integrationId,
        connectorKey: persisted.connectorKey,
      },
    });

    return {
      integrationId,
      status: "connected",
      expiresAt: isoInFuture(tokens.expires_in ?? null),
      scopes: tokens.scope ? tokens.scope.split(" ") : persisted.scopes,
    };
  }

  /**
   * Refresh the access token for `integrationId` using its stored
   * refresh token. Best-effort: when no refresh token is stored, or
   * the provider rejects the refresh, the integration is marked
   * `expired` and the caller must re-authorize.
   */
  async refreshToken(integrationId: string): Promise<{
    ok: boolean;
    expiresAt: string | null;
    reason?: string;
  }> {
    try {
      const { data, error } = await this.supabase
        .from("integrations")
        .select("workspace_id, connector_key")
        .eq("id", integrationId)
        .maybeSingle();
      if (error) throw toDbError(error, "oauth.refreshToken: lookup failed");
      if (!data) throw new Error("Integration not found.");
      const integration = data as { workspace_id: string; connector_key: string };

      const connector = connectorRegistry.require(integration.connector_key);
      const vault = getCredentialVault();
      const refreshToken = await vault.getDecrypted(integrationId, "oauth_refresh_token");
      if (!refreshToken) {
        await this.markExpired(integrationId, "no_refresh_token");
        return { ok: false, expiresAt: null, reason: "no_refresh_token" };
      }

      let tokens: TokenSet;
      try {
        tokens = await connector.refreshAccessToken(refreshToken.value);
      } catch (err) {
        logger.warn("oauth-manager: refresh rejected", {
          integrationId,
          error: String(err),
        });
        await this.markExpired(integrationId, "refresh_rejected");
        return { ok: false, expiresAt: null, reason: "refresh_rejected" };
      }

      await vault.storeOAuthTokens({
        integrationId,
        workspaceId: integration.workspace_id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? refreshToken.value,
        expiresInSec: tokens.expires_in,
        scopes: tokens.scope ? tokens.scope.split(" ") : refreshToken.scopes,
        metadata: { token_type: tokens.token_type ?? "Bearer" },
      });
      return {
        ok: true,
        expiresAt: isoInFuture(tokens.expires_in ?? null),
      };
    } catch (err) {
      throw wrapIntegrationError(err, "Unexpected OAuth refresh failure.", {
        integrationId,
      });
    }
  }

  /**
   * Revoke the OAuth2 grant. Best-effort: calls the provider's revoke
   * endpoint (when known) then deletes the stored credentials.
   */
  async revoke(integrationId: string): Promise<{ revoked: boolean }> {
    try {
      const { data, error } = await this.supabase
        .from("integrations")
        .select("workspace_id, connector_key")
        .eq("id", integrationId)
        .maybeSingle();
      if (error) throw toDbError(error, "oauth.revoke: lookup failed");
      if (!data) return { revoked: false };
      const integration = data as { workspace_id: string; connector_key: string };

      const vault = getCredentialVault();
      const accessToken = await vault.getDecrypted(integrationId, "oauth_access_token");

      if (accessToken) {
        try {
          const connector = connectorRegistry.require(integration.connector_key);
          await connector.revokeToken(accessToken.value);
        } catch (err) {
          logger.warn("oauth-manager: revoke endpoint failed", {
            integrationId,
            error: String(err),
          });
        }
      }
      await vault.deleteAll(integrationId);

      await this.supabase
        .from("integrations")
        .update({ status: "revoked" } as never)
        .eq("id", integrationId);

      return { revoked: true };
    } catch (err) {
      throw wrapIntegrationError(err, "Unexpected OAuth revoke failure.", {
        integrationId,
      });
    }
  }

  /**
   * Ensure the integration has a fresh access token. When the stored
   * access token is within {@link REFRESH_SKEW_SEC} of expiry (or already
   * expired), this calls {@link refreshToken} and returns the updated
   * expiry. Returns the current token + expiry when still valid.
   */
  async ensureFreshToken(integrationId: string): Promise<{
    accessToken: string;
    expiresAt: string | null;
    refreshed: boolean;
  }> {
    const vault = getCredentialVault();
    const access = await vault.getDecrypted(integrationId, "oauth_access_token");
    if (!access) {
      throw new Error("No OAuth access token stored for this integration.");
    }
    if (access.expiresAt) {
      const expiresAtMs = Date.parse(access.expiresAt);
      const skewMs = REFRESH_SKEW_SEC * 1000;
      if (Number.isFinite(expiresAtMs) && expiresAtMs - skewMs <= Date.now()) {
        const result = await this.refreshToken(integrationId);
        if (!result.ok) {
          throw new Error("OAuth token expired and could not be refreshed.");
        }
        const fresh = await vault.getDecrypted(integrationId, "oauth_access_token");
        if (!fresh) {
          throw new Error("OAuth refresh succeeded but no token was stored.");
        }
        return {
          accessToken: fresh.value,
          expiresAt: fresh.expiresAt,
          refreshed: true,
        };
      }
    }
    return { accessToken: access.value, expiresAt: access.expiresAt, refreshed: false };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async markExpired(integrationId: string, reason: string): Promise<void> {
    try {
      await this.supabase
        .from("integrations")
        .update({
          status: "expired",
          last_error: reason,
        } as never)
        .eq("id", integrationId);
    } catch (err) {
      logger.warn("oauth-manager: markExpired failed", {
        integrationId,
        reason,
        error: String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _mgr: OAuthManager | null = null;

/** Get the shared OAuth manager (singleton). */
export function getOAuthManager(): OAuthManager {
  if (_mgr) return _mgr;
  _mgr = new OAuthManager(createSupabaseAdminClient());
  return _mgr;
}

/** Get an OAuth manager bound to a specific admin client (tests / DI). */
export function getOAuthManagerWith(supabase: AdminSupabaseClient): OAuthManager {
  return new OAuthManager(supabase);
}

// Re-export computeRetryDelay so callers that import from this module
// have it in one place.
export { computeRetryDelay };
