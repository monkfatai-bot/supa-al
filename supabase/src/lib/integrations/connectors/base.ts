/**
 * Supa AI — Phase 10 Integration Hub — Base Connector.
 *
 * Every concrete connector (Slack, GitHub, OpenAI, etc.) extends
 * {@link BaseConnector} and self-registers via {@link BaseConnectorFactory}.
 *
 * The base class enforces:
 *   - A canonical {@link ConnectorDefinition} (key, name, category,
 *     authType, capabilities, etc.).
 *   - A {@link healthCheck} method the IntegrationService uses to poll
 *     status.
 *
 * For OAuth2 connectors, the base class also defines the methods
 * {@link OAuthManager} calls: `getClientId`, `getAuthorizeUrl`,
 * `exchangeCodeForTokens`, `refreshAccessToken`, `revokeToken`. Concrete
 * OAuth2 connectors override these.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/base
 */
import "server-only";

import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";

import type {
  ConnectorDefinition,
  ConnectorHealthResult,
  IntegrationAuthType,
  IntegrationHealthStatus,
  MarketplaceAppCategory,
} from "../types";

// ---------------------------------------------------------------------------
// Token shapes (used by OAuth2 connectors)
// ---------------------------------------------------------------------------

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

// ---------------------------------------------------------------------------
// BaseConnector
// ---------------------------------------------------------------------------

/**
 * Abstract base class every concrete connector extends. Subclasses
 * must implement {@link getDefinition} and {@link healthCheck}. OAuth2
 * connectors additionally override the OAuth flow methods.
 */
export abstract class BaseConnector {
  /** Canonical definition exposed to the registry + UI. */
  abstract getDefinition(): ConnectorDefinition;

  /** Verify the connector's API key / OAuth token is still valid. */
  abstract healthCheck(): Promise<ConnectorHealthResult>;

  /** True when the connector's required env vars are set. */
  isConfigured(): boolean {
    return true;
  }

  // -------------------------------------------------------------------------
  // OAuth2 hooks (only meaningful when authType === 'oauth2')
  // -------------------------------------------------------------------------

  /** OAuth2 client id from env. Override per-connector. */
  getClientId(): string {
    return "";
  }

  /** OAuth2 client secret from env. Override per-connector. */
  protected getClientSecret(): string {
    return "";
  }

  /** OAuth2 authorize URL the browser redirects to. Override per-connector. */
  getAuthorizeUrl(): string {
    return "";
  }

  /** OAuth2 token URL for code exchange. Override per-connector. */
  protected getTokenUrl(): string {
    return "";
  }

  /** OAuth2 revoke URL. Override per-connector. */
  protected getRevokeUrl(): string {
    return "";
  }

  /**
   * Exchange an authorization code for an access token. Default
   * implementation POSTs `application/x-www-form-urlencoded` to
   * {@link getTokenUrl} and parses the JSON response. Override for
   * providers with non-standard exchanges (e.g. Basic auth header).
   */
  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenSet> {
    const tokenUrl = this.getTokenUrl();
    if (!tokenUrl) throw new Error(`Connector ${this.getDefinition().key} has no token URL.`);

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: this.getClientId(),
      client_secret: this.getClientSecret(),
    });
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OAuth token exchange failed (${res.status}): ${text}`);
    }
    return (await res.json()) as TokenSet;
  }

  /**
   * Refresh an access token using a stored refresh token. Default
   * implementation POSTs to {@link getTokenUrl} with the
   * `refresh_token` grant.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const tokenUrl = this.getTokenUrl();
    if (!tokenUrl) throw new Error(`Connector ${this.getDefinition().key} has no token URL.`);

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.getClientId(),
      client_secret: this.getClientSecret(),
    });
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OAuth token refresh failed (${res.status}): ${text}`);
    }
    return (await res.json()) as TokenSet;
  }

  /**
   * Revoke an access token. Default implementation POSTs to
   * {@link getRevokeUrl} (no body). Override for providers with
   * non-standard revoke semantics.
   */
  async revokeToken(accessToken: string): Promise<void> {
    const revokeUrl = this.getRevokeUrl();
    if (!revokeUrl) return; // provider has no revoke endpoint.
    const res = await fetch(revokeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: accessToken }),
    });
    if (!res.ok && res.status !== 204) {
      logger.warn("connector.revokeToken: non-ok response", {
        connector: this.getDefinition().key,
        status: res.status,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------

  /**
   * Measure the latency of `fn` and bundle the result into a
   * {@link ConnectorHealthResult}. Subclasses call this from their
   * `healthCheck()` impl so the timing is consistent.
   */
  protected async measureHealth(
    fn: () => Promise<{ ok: boolean; message?: string; details?: Record<string, unknown> }>,
  ): Promise<ConnectorHealthResult> {
    const startedAt = Date.now();
    try {
      const result = await fn();
      const latencyMs = Date.now() - startedAt;
      const status: IntegrationHealthStatus = result.ok
        ? "healthy"
        : latencyMs > 5_000
          ? "degraded"
          : "down";
      return {
        status,
        latencyMs,
        message: result.message,
        details: result.details,
      };
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      return {
        status: "down",
        latencyMs,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// BaseConnectorFactory
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper that pairs a constructor with a lazy singleton.
 * Concrete connectors register an instance via the registry; the
 * factory holds the class + cached instance so callers can construct
 * fresh instances (stateless) on demand.
 */
export class BaseConnectorFactory<T extends BaseConnector = BaseConnector> {
  constructor(
    private readonly ctor: new () => T,
    private readonly definition: ConnectorDefinition,
  ) {}

  /** Build a fresh connector instance (stateless). */
  create(): T {
    return new this.ctor();
  }

  /** Canonical definition (cached on the factory, not the instance). */
  getDefinition(): ConnectorDefinition {
    return this.definition;
  }
}

// ---------------------------------------------------------------------------
// Helpers shared by concrete connectors
// ---------------------------------------------------------------------------

/**
 * Build a {@link ConnectorDefinition} with sensible defaults so each
 * concrete connector's `getDefinition()` body is one line.
 */
export function defineConnector(input: {
  key: string;
  name: string;
  category: MarketplaceAppCategory;
  authType: IntegrationAuthType;
  capabilities: string[];
  description?: string;
  icon?: string;
  requiredScopes?: string[];
  configSchema?: Record<string, unknown>;
}): ConnectorDefinition {
  return { ...input };
}

/**
 * Read an env var via {@link env} (so `env` is the single source of
 * truth). Returns `""` for unknown vars so the `isConfigured()` check
 * is uniform.
 */
export function readEnv(name: string): string {
  // `env` is a frozen object; we reflect on it so unknown keys return
  // "" instead of throwing. Concrete connectors call this with their
  // well-known env-var names.
  const value = (process.env as Record<string, string | undefined>)[name];
  return typeof value === "string" ? value : "";
}

/**
 * A connector is configured when every `requiredEnvVars` is non-empty.
 */
export function checkEnvConfigured(requiredEnvVars: string[]): boolean {
  return requiredEnvVars.every((name) => readEnv(name).length > 0);
}
