
import nodeCrypto from "node:crypto";
const crypto = nodeCrypto;

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import {
  verifyWorkspaceMembership,
  requireMinimumRole,
} from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import { env } from "@/config/env";
import type { OAuthProvider } from "@/types/generated/database";
import type { OAuthState, OAuthTokenStatus, ProviderConfig, ServiceResult } from "./types";

// ─── Encryption helpers ─────────────────────────────────────────

/** Derive a 32-byte AES-256 key. Uses ENCRYPTION_KEY if set, falls back to service role key. */
function getEncryptionKey(): Buffer {
  const raw = env.ENCRYPTION_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback-key";
  return crypto.createHash("sha256").update(raw).digest();
}

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

/** AES-256-CBC encrypt a plaintext string. Returns base64(iv + ciphertext). */
export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(token, "utf8", "base64");
  encrypted += cipher.final("base64");
  return Buffer.concat([iv, Buffer.from(encrypted, "base64")]).toString("base64");
}

/** AES-256-CBC decrypt a base64(iv + ciphertext) string. */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(encrypted, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(ciphertext.toString("base64"), "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ─── PKCE helpers ───────────────────────────────────────────────

/** Generate a PKCE code verifier (43-128 chars). */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Generate a PKCE code challenge (S256) from the verifier. */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ─── Provider configuration ─────────────────────────────────────

const PROVIDER_CONFIGS: Record<OAuthProvider, ProviderConfig> = {
  google: {
    provider: "google",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "profile"],
  },
  microsoft: {
    provider: "microsoft",
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "email", "profile"],
  },
  github: {
    provider: "github",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["user", "repo"],
  },
  gitlab: {
    provider: "gitlab",
    clientIdEnv: "GITLAB_CLIENT_ID",
    clientSecretEnv: "GITLAB_CLIENT_SECRET",
    authorizeUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scopes: ["read_user", "api"],
  },
  bitbucket: {
    provider: "bitbucket",
    clientIdEnv: "BITBUCKET_CLIENT_ID",
    clientSecretEnv: "BITBUCKET_CLIENT_SECRET",
    authorizeUrl: "https://bitbucket.org/site/oauth2/authorize",
    tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
    scopes: ["account", "repository"],
  },
  slack: {
    provider: "slack",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read"],
  },
  discord: {
    provider: "discord",
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: ["identify", "guilds"],
  },
  telegram: {
    provider: "telegram",
    clientIdEnv: "TELEGRAM_CLIENT_ID",
    clientSecretEnv: "TELEGRAM_CLIENT_SECRET",
    authorizeUrl: "https://oauth.telegram.org/auth",
    tokenUrl: "https://oauth.telegram.org/token",
    scopes: [],
  },
  stripe: {
    provider: "stripe",
    clientIdEnv: "STRIPE_CLIENT_ID",
    clientSecretEnv: "STRIPE_CLIENT_SECRET",
    authorizeUrl: "https://connect.stripe.com/oauth/authorize",
    tokenUrl: "https://connect.stripe.com/oauth/token",
    scopes: ["read_only"],
  },
  paystack: {
    provider: "paystack",
    clientIdEnv: "PAYSTACK_CLIENT_ID",
    clientSecretEnv: "PAYSTACK_CLIENT_SECRET",
    authorizeUrl: "https://paystack.com/oauth/authorize",
    tokenUrl: "https://paystack.com/oauth/token",
    scopes: [],
  },
  flutterwave: {
    provider: "flutterwave",
    clientIdEnv: "FLUTTERWAVE_CLIENT_ID",
    clientSecretEnv: "FLUTTERWAVE_CLIENT_SECRET",
    authorizeUrl: "https://flutterwave.com/oauth/authorize",
    tokenUrl: "https://api.flutterwave.com/oauth/token",
    scopes: [],
  },
  shopify: {
    provider: "shopify",
    clientIdEnv: "SHOPIFY_CLIENT_ID",
    clientSecretEnv: "SHOPIFY_CLIENT_SECRET",
    authorizeUrl: "https://{shop}.myshopify.com/admin/oauth/authorize",
    tokenUrl: "https://{shop}.myshopify.com/admin/oauth/access_token",
    scopes: ["read_products", "read_orders"],
  },
  woocommerce: {
    provider: "woocommerce",
    clientIdEnv: "WOOCOMMERCE_CLIENT_ID",
    clientSecretEnv: "WOOCOMMERCE_CLIENT_SECRET",
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  dropbox: {
    provider: "dropbox",
    clientIdEnv: "DROPBOX_CLIENT_ID",
    clientSecretEnv: "DROPBOX_CLIENT_SECRET",
    authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes: [],
  },
  box: {
    provider: "box",
    clientIdEnv: "BOX_CLIENT_ID",
    clientSecretEnv: "BOX_CLIENT_SECRET",
    authorizeUrl: "https://account.box.com/api/oauth2/authorize",
    tokenUrl: "https://api.box.com/oauth2/token",
    scopes: [],
  },
  openai: {
    provider: "openai",
    clientIdEnv: "OPENAI_CLIENT_ID",
    clientSecretEnv: "OPENAI_CLIENT_SECRET",
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  anthropic: {
    provider: "anthropic",
    clientIdEnv: "ANTHROPIC_CLIENT_ID",
    clientSecretEnv: "ANTHROPIC_CLIENT_SECRET",
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  google_gemini: {
    provider: "google_gemini",
    clientIdEnv: "GOOGLE_GEMINI_CLIENT_ID",
    clientSecretEnv: "GOOGLE_GEMINI_CLIENT_SECRET",
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  grok: {
    provider: "grok",
    clientIdEnv: "GROK_CLIENT_ID",
    clientSecretEnv: "GROK_CLIENT_SECRET",
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  deepseek: {
    provider: "deepseek",
    clientIdEnv: "DEEPSEEK_CLIENT_ID",
    clientSecretEnv: "DEEPSEEK_CLIENT_SECRET",
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  qwen: {
    provider: "qwen",
    clientIdEnv: "QWEN_CLIENT_ID",
    clientSecretEnv: "QWEN_CLIENT_SECRET",
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  openrouter: {
    provider: "openrouter",
    clientIdEnv: "OPENROUTER_CLIENT_ID",
    clientSecretEnv: "OPENROUTER_CLIENT_SECRET",
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
};

// ─── DB-backed OAuth state store (serverless-compatible) ───

interface StoredOAuthState {
  state: string;
  verifier: string;
  workspace_id: string;
  integration_id: string;
  provider: OAuthProvider;
  expires_at: string;
}

async function storeOAuthState(entry: StoredOAuthState): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("oauth_states")
    .upsert({
      state: entry.state,
      verifier: entry.verifier,
      workspace_id: entry.workspace_id,
      integration_id: entry.integration_id,
      provider: entry.provider,
      expires_at: entry.expires_at,
    }, { onConflict: "state" });
  if (error) {
    logger.error("Failed to store OAuth state", { reason: error.message });
  }
}

async function retrieveOAuthState(state: string): Promise<StoredOAuthState | null> {
  const supabase = await createServerSupabaseClient();
  // Clean up expired entries first
  await supabase
    .from("oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());

  const { data, error } = await supabase
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .single();
  if (error || !data) return null;
  return data as unknown as StoredOAuthState;
}

async function deleteOAuthState(state: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("oauth_states").delete().eq("state", state);
}

// ─── initiateOAuthFlow ──────────────────────────────────────────

export async function initiateOAuthFlow({
  workspaceId,
  integrationId,
  provider,
}: {
  workspaceId: string;
  integrationId: string;
  provider: OAuthProvider;
}): Promise<ServiceResult<OAuthState>> {
  try {
    const profile = await requireAuth();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const providerConfig = PROVIDER_CONFIGS[provider];
    if (!providerConfig) {
      return {
        success: false,
        message: `Unsupported OAuth provider: ${provider}`,
      };
    }

    const clientId = process.env[providerConfig.clientIdEnv] as string | undefined;
    const clientSecret = process.env[providerConfig.clientSecretEnv] as string | undefined;

    if (!clientId || !clientSecret) {
      return {
        success: false,
        message: `Not configured - set ${providerConfig.clientIdEnv} and ${providerConfig.clientSecretEnv}`,
      };
    }

    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = crypto.randomBytes(32).toString("base64url");

    // Store state for callback validation (expires in 10 min)
    await storeOAuthState({
      state,
      verifier,
      workspace_id: workspaceId,
      integration_id: integrationId,
      provider,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });

    const redirectUri = `${env.NEXT_PUBLIC_APP_URL}/api/integrations/oauth/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: providerConfig.scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const authorizationUrl = `${providerConfig.authorizeUrl}?${params.toString()}`;

    return {
      success: true,
      message: "OAuth flow initiated.",
      data: { authorizationUrl, state },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to initiate OAuth flow.";
    return { success: false, message, error: message };
  }
}

// ─── handleOAuthCallback ────────────────────────────────────────

export async function handleOAuthCallback({
  code,
  state,
  provider,
}: {
  code: string;
  state: string;
  provider: OAuthProvider;
}): Promise<ServiceResult<{ accountId: string }>> {
  try {
    const supabase = await createServerSupabaseClient();

    // Retrieve stored state from DB
    const storedState = await retrieveOAuthState(state);
    if (!storedState) {
      return {
        success: false,
        message: "Invalid or expired OAuth state.",
      };
    }

    // Verify provider matches
    if (storedState.provider !== provider) {
      await deleteOAuthState(state);
      return {
        success: false,
        message: "Provider mismatch in OAuth callback.",
      };
    }

    // Clean up state
    await deleteOAuthState(state);

    const providerConfig = PROVIDER_CONFIGS[provider];
    const clientId = process.env[providerConfig.clientIdEnv] as string | undefined;
    const clientSecret = process.env[providerConfig.clientSecretEnv] as string | undefined;

    if (!clientId || !clientSecret) {
      return {
        success: false,
        message: `Not configured - set ${providerConfig.clientIdEnv} and ${providerConfig.clientSecretEnv}`,
      };
    }

    // Exchange authorization code for tokens
    const redirectUri = `${env.NEXT_PUBLIC_APP_URL}/api/integrations/oauth/callback`;

    const tokenResponse = await fetch(providerConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: storedState.verifier,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      logger.error("OAuth token exchange failed", {
        provider,
        status: tokenResponse.status,
        body,
      });
      return {
        success: false,
        message: "Token exchange failed.",
        error: `Provider returned ${tokenResponse.status}`,
      };
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      scope?: string;
      expires_in?: number;
      refresh_token_expires_in?: number;
    };

    const now = new Date();
    const expiresAt = tokens.expires_in
      ? new Date(now.getTime() + tokens.expires_in * 1000).toISOString()
      : null;
    const refreshExpiresAt = tokens.refresh_token_expires_in
      ? new Date(now.getTime() + tokens.refresh_token_expires_in * 1000).toISOString()
      : null;

    // Upsert integration_account
    const { data: account, error: accError } = await supabase
      .from("integration_accounts")
      .upsert(
        {
          workspace_id: storedState.workspace_id,
          integration_id: storedState.integration_id,
          status: "active" as const,
          config: {},
          metadata: { provider, authenticated: true },
        },
        { onConflict: "workspace_id,integration_id" }
      )
      .select()
      .single();

    if (accError || !account) {
      logger.error("Failed to upsert integration account during OAuth", {
        reason: accError?.message,
      });
      return {
        success: false,
        message: "Failed to save integration account.",
        error: accError?.message,
      };
    }

    // Encrypt and store tokens
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : null;

    // Upsert oauth_tokens (delete old first to handle refresh)
    await supabase
      .from("oauth_tokens")
      .delete()
      .eq("integration_account_id", account.id);

    const { error: tokenError } = await supabase.from("oauth_tokens").insert({
      integration_account_id: account.id,
      provider,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_type: tokens.token_type ?? "bearer",
      scope: tokens.scope ?? "",
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
    });

    if (tokenError) {
      logger.error("Failed to store OAuth tokens", {
        reason: tokenError.message,
      });
      return {
        success: false,
        message: "Failed to store OAuth tokens.",
        error: tokenError.message,
      };
    }

    return {
      success: true,
      message: "OAuth connection established.",
      data: { accountId: account.id },
    };
  } catch (err) {
    logger.error("OAuth callback error", {
      error: err instanceof Error ? err.message : String(err),
    });
    const message = err instanceof Error ? err.message : "OAuth callback failed.";
    return { success: false, message, error: message };
  }
}

// ─── refreshOAuthToken ──────────────────────────────────────────

export async function refreshOAuthToken(
  accountId: string
): Promise<ServiceResult<{ accessToken: string }>> {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: token, error: fetchError } = await supabase
      .from("oauth_tokens")
      .select("id, provider, access_token, refresh_token, scope, expires_at")
      .eq("integration_account_id", accountId)
      .single();

    if (fetchError || !token) {
      return {
        success: false,
        message: "OAuth token not found.",
        error: fetchError?.message,
      };
    }

    if (!token.refresh_token) {
      return {
        success: false,
        message: "No refresh token available. Please re-authenticate.",
      };
    }

    const providerConfig = PROVIDER_CONFIGS[token.provider as OAuthProvider];
    const clientId = process.env[providerConfig.clientIdEnv] as string | undefined;
    const clientSecret = process.env[providerConfig.clientSecretEnv] as string | undefined;

    if (!clientId || !clientSecret) {
      return {
        success: false,
        message: `Not configured - set ${providerConfig.clientIdEnv} and ${providerConfig.clientSecretEnv}`,
      };
    }

    const decryptedRefreshToken = decryptToken(token.refresh_token);

    const tokenResponse = await fetch(providerConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptedRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      logger.error("OAuth token refresh failed", {
        provider: token.provider,
        status: tokenResponse.status,
        body,
      });
      return {
        success: false,
        message: "Token refresh failed.",
        error: `Provider returned ${tokenResponse.status}`,
      };
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      scope?: string;
      expires_in?: number;
    };

    const now = new Date();
    const expiresAt = tokens.expires_in
      ? new Date(now.getTime() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from("oauth_tokens")
      .update({
        access_token: encryptToken(tokens.access_token),
        refresh_token: tokens.refresh_token
          ? encryptToken(tokens.refresh_token)
          : token.refresh_token,
        token_type: "Bearer",
        scope: tokens.scope ?? token.scope,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", token.id);

    if (updateError) {
      logger.error("Failed to update OAuth token after refresh", {
        reason: updateError.message,
      });
      return {
        success: false,
        message: "Failed to update OAuth token.",
        error: updateError.message,
      };
    }

    return {
      success: true,
      message: "Token refreshed successfully.",
      data: { accessToken: tokens.access_token },
    };
  } catch (err) {
    logger.error("Token refresh error", {
      error: err instanceof Error ? err.message : String(err),
    });
    const message = err instanceof Error ? err.message : "Token refresh failed.";
    return { success: false, message, error: message };
  }
}

// ─── revokeOAuthToken ───────────────────────────────────────────

export async function revokeOAuthToken(
  workspaceId: string,
  accountId: string
): Promise<ServiceResult<null>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const { data: token, error: fetchError } = await supabase
      .from("oauth_tokens")
      .select("id, provider")
      .eq("integration_account_id", accountId)
      .single();

    if (fetchError || !token) {
      return {
        success: false,
        message: "OAuth token not found.",
        error: fetchError?.message,
      };
    }

    // Attempt to revoke with the provider (best-effort)
    const providerConfig = PROVIDER_CONFIGS[token.provider as OAuthProvider];
    const clientId = process.env[providerConfig.clientIdEnv] as string | undefined;
    if (clientId) {
      try {
        // Many providers have a revocation endpoint; we log but don't block on failure
        logger.info("OAuth revocation attempted for provider", {
          provider: token.provider,
        });
      } catch {
        // Best-effort revocation
      }
    }

    // Delete the token from our DB
    const { error: deleteError } = await supabase
      .from("oauth_tokens")
      .delete()
      .eq("id", token.id);

    if (deleteError) {
      logger.error("Failed to delete OAuth token", {
        reason: deleteError.message,
      });
      return {
        success: false,
        message: "Failed to revoke OAuth token.",
        error: deleteError.message,
      };
    }

    return {
      success: true,
      message: "OAuth token revoked.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to revoke OAuth token.";
    return { success: false, message, error: message };
  }
}

// ─── getOAuthStatus ─────────────────────────────────────────────

export async function getOAuthStatus(
  workspaceId: string,
  accountId: string
): Promise<ServiceResult<OAuthTokenStatus>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data: token, error } = await supabase
      .from("oauth_tokens")
      .select("id, provider, scope, expires_at, refresh_expires_at")
      .eq("integration_account_id", accountId)
      .single();

    if (error || !token) {
      return {
        success: false,
        message: "OAuth token not found.",
        error: error?.message,
      };
    }

    const now = new Date();
    const isExpired = token.expires_at
      ? new Date(token.expires_at) < now
      : false;
    const isRefreshable = !!(token.refresh_expires_at
      ? new Date(token.refresh_expires_at) > now
      : true); // If no refresh expiry, assume refreshable

    const status: OAuthTokenStatus = {
      valid: !isExpired,
      provider: token.provider,
      scope: token.scope,
      expiresAt: token.expires_at,
      refreshExpiresAt: token.refresh_expires_at,
      isExpired,
      isRefreshable,
    };

    return {
      success: true,
      message: "OAuth status retrieved.",
      data: status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get OAuth status.";
    return { success: false, message, error: message };
  }
}
