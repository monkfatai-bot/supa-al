/**
 * Supa AI — AuthService.
 *
 * Orchestrates Supabase Auth with the Phase 2 data-access services
 * (profile, sessions, notifications, activity, account, linked-accounts).
 * Every method is server-only.
 *
 * Responsibilities:
 *   - Email/password sign-up + sign-in (with brute-force protection).
 *   - Password reset, password change, email change, email verification.
 *   - OAuth sign-in (PKCE) + callback handling.
 *   - Sign-out, account deletion, GDPR data export.
 *
 * Every auth-state-changing operation writes an `activity_logs` row via the
 * activity service (which uses the admin client so the insert bypasses RLS —
 * see migration 0004). Secrets are NEVER logged; structured metadata is
 * sanitized through `sanitizeMetadata` first.
 *
 * @module @/lib/auth/auth-service
 */
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Provider } from "@supabase/supabase-js";

import { env } from "@/lib/config/env";
import {
  AuthenticationError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/types";
import {
  createSupabaseServerClient,
  type ServerSupabaseClient,
} from "@/lib/supabase/server";

import type { AuthUser } from "@/lib/auth/session";
import { getSession } from "@/lib/auth/session";
import {
  checkBruteForce,
  recordFailedAttempt,
  clearAttempts,
} from "@/lib/auth/brute-force";

import {
  createProfileService,
  type ProfileService,
} from "@/lib/auth/profile";
import {
  createSessionService,
  type SessionService,
} from "@/lib/auth/sessions";
import {
  createNotificationService,
  type NotificationService,
} from "@/lib/auth/notifications";
import {
  createActivityLogService,
  type ActivityLogService,
  type ActivityEventType,
  type ActivitySeverity,
} from "@/lib/auth/activity";
import {
  createAccountService,
  type AccountService,
} from "@/lib/auth/account";
import {
  createLinkedAccountsService,
  type LinkedAccountsService,
} from "@/lib/auth/linked-accounts";
import {
  parseUserAgent,
  getClientIp,
  sanitizeMetadata,
} from "@/lib/auth/helpers";

// ---------------------------------------------------------------------------
// Types — public input/output contracts
// ---------------------------------------------------------------------------

export interface SignUpInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface SignInInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignUpResult {
  user: AuthUser;
  needsEmailVerification: boolean;
}

export interface SignInResult {
  user: AuthUser;
}

export interface OAuthCallbackResult {
  user: AuthUser;
}

export interface DownloadDataResult {
  downloadUrl: string;
  expiresAt: string;
}

export type OAuthProviderId = "google" | "github" | "microsoft" | "apple";

// ---------------------------------------------------------------------------
// Supabase error → AppError mapping
// ---------------------------------------------------------------------------

/**
 * Translate a Supabase auth error into the appropriate {@link AppError}.
 *
 * Heuristics (Supabase error names are stable enough to branch on):
 *   - `AuthApiError` with status 400 + "already registered" → ConflictError (409).
 *   - `AuthApiError` with status 400 + "Invalid credentials" → AuthenticationError (401),
 *     with a GENERIC message that never reveals which of email/password is wrong.
 *   - `AuthApiError` with status 422 + "Password" → ValidationError.
 *   - `WeakPasswordError` → ValidationError.
 *   - `AuthRetryableError` → ExternalServiceError (502).
 *   - Anything else → AuthenticationError (safe default) with internal=true
 *     so the raw message is hidden.
 */
function mapSupabaseAuthError(err: {
  name: string;
  message: string;
  status?: number;
}): Error {
  const msg = err.message ?? "";
  const lower = msg.toLowerCase();

  // Already-registered / duplicate email.
  if (
    err.status === 400 &&
    (lower.includes("already registered") ||
      lower.includes("user already registered") ||
      lower.includes("already been registered"))
  ) {
    return new ConflictError("An account with this email already exists.");
  }

  // Weak / invalid password.
  if (
    err.name === "WeakPasswordError" ||
    lower.includes("password should be at least") ||
    lower.includes("password is too weak")
  ) {
    return new ValidationError("Password is too weak. Use 8+ chars with upper, lower, and a digit.");
  }

  // Invalid credentials → NEVER reveal which field is wrong.
  if (
    lower.includes("invalid credentials") ||
    lower.includes("invalid login credentials") ||
    lower.includes("email not confirmed")
  ) {
    return new AuthenticationError("Invalid email or password.");
  }

  // Rate-limited by Supabase itself.
  if (err.status === 429 || lower.includes("rate limit")) {
    return new AuthenticationError("Too many attempts. Please try again later.");
  }

  // Retryable upstream failure.
  if (err.name === "AuthRetryableError") {
    return new ExternalServiceError("Authentication service is temporarily unavailable.");
  }

  // Fall through: treat as auth error but mark internal so the message is hidden.
  return new AuthenticationError("We couldn't complete the authentication request.", {
    cause: { name: err.name, message: msg },
  });
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

/**
 * Server-only orchestrator. Use via {@link createAuthService} (the per-request
 * factory). Do not construct directly outside tests.
 */
export class AuthService {
  // Per-request Supabase server client (anon key, RLS-enforced, session-bearing).
  private readonly supabase: ServerSupabaseClient;

  // Data-access services. The async ones are constructed once per request by
  // `createAuthService()` and passed in here so the constructor stays sync.
  private readonly profileService: ProfileService;
  private readonly sessionService: SessionService;
  private readonly notificationService: NotificationService;
  private readonly activityService: ActivityLogService;
  private readonly accountService: AccountService;
  private readonly linkedAccountsService: LinkedAccountsService;

  constructor(opts: {
    supabase: ServerSupabaseClient;
    profileService: ProfileService;
    sessionService: SessionService;
    notificationService: NotificationService;
    activityService: ActivityLogService;
    accountService: AccountService;
    linkedAccountsService: LinkedAccountsService;
  }) {
    this.supabase = opts.supabase;
    this.profileService = opts.profileService;
    this.sessionService = opts.sessionService;
    this.notificationService = opts.notificationService;
    this.activityService = opts.activityService;
    this.accountService = opts.accountService;
    this.linkedAccountsService = opts.linkedAccountsService;
  }

  // -------------------------------------------------------------------------
  // Email + password flows
  // -------------------------------------------------------------------------

  /**
   * Sign up a new user with email + password. Optionally seeds the user's
   * `full_name` from `displayName`.
   *
   * Behavior:
   *   - Calls `supabase.auth.signUp()` with `emailRedirectTo` set to the app
   *     callback URL.
   *   - When Supabase returns a session immediately (email confirmation
   *     disabled), `needsEmailVerification` is `false`; otherwise `true`.
   *   - Writes a `signup` activity log + a `welcome` notification.
   *   - Maps Supabase errors per {@link mapSupabaseAuthError}.
   */
  async signUpWithEmail(input: SignUpInput): Promise<SignUpResult> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName?.trim() || undefined;

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        emailRedirectTo: `${env.app.url}/api/auth/callback`,
        data: displayName ? { full_name: displayName, name: displayName } : undefined,
      },
    });

    if (error) {
      throw mapSupabaseAuthError(error);
    }

    const user = data.user;
    if (!user) {
      // Should not happen — signUp returns either an error or a user.
      throw new DatabaseError("Supabase signUp returned no user and no error.");
    }

    // `session` is null when email verification is required.
    const needsEmailVerification = data.session === null;

    // Best-effort enrichment — never fail the sign-up over a logging blip.
    await this.writeActivity({
      userId: user.id,
      eventType: "signup",
      severity: "info",
      metadata: sanitizeMetadata({
        method: "email",
        emailVerified: !!user.email_confirmed_at,
        needsEmailVerification,
      }),
    }).catch((err) => {
      logger.warn("auth.signUp: activity log write failed", { error: String(err) });
    });

    await this.notificationService
      .create(user.id, {
        type: "welcome",
        title: "Welcome to Supa AI",
        message: displayName
          ? `Welcome aboard, ${displayName}! Your account is ready.`
          : "Welcome aboard! Your account is ready.",
        actionUrl: "/dashboard",
        actionLabel: "Go to dashboard",
        metadata: { source: "signup" },
      })
      .catch((err) => {
        logger.warn("auth.signUp: welcome notification failed", { error: String(err) });
      });

    logger.info("auth.signUp: user signed up", {
      userId: user.id,
      needsEmailVerification,
    });

    return { user, needsEmailVerification };
  }

  /**
   * Sign in with email + password.
   *
   * Brute-force protection: the caller is expected to have already called
   * `checkBruteForce()` and rejected if locked. **On a failed sign-in** this
   * method records the failed attempt via `recordFailedAttempt()` and throws
   * `RateLimitError` if the threshold is reached. On success it clears the
   * counter.
   *
   * The caller MUST pass `bfKey` so we can attribute the failure correctly.
   */
  async signInWithEmail(
    input: SignInInput,
    ctx: { ip: string; userAgent: string | null; bfKey: string },
  ): Promise<SignInResult> {
    const email = input.email.trim().toLowerCase();

    // Re-check the lock right before attempting — covers the race where the
    // counter flipped over between the route's pre-check and this call.
    const preCheck = await checkBruteForce(ctx.bfKey);
    if (preCheck.locked) {
      throw new RateLimitError(
        "Too many failed sign-in attempts. Please try again later.",
        preCheck.retryAfter,
        { attempts: preCheck.attempts },
      );
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });

    if (error) {
      // Record the failure — if this bump crosses the threshold, surface as
      // a RateLimitError so the client sees the lockout immediately.
      const state = await recordFailedAttempt(ctx.bfKey);
      if (state.locked) {
        // Also log the lockout event for security visibility.
        await this.writeActivity({
          userId: null,
          eventType: "failed_login",
          severity: "warn",
          metadata: sanitizeMetadata({
            email,
            ip: ctx.ip,
            reason: "brute_force_lock",
            attempts: state.attempts,
          }),
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        }).catch(() => {});
        throw new RateLimitError(
          "Too many failed sign-in attempts. Please try again later.",
          state.retryAfter,
          { attempts: state.attempts },
        );
      }

      // Log the failed attempt (no userId — we don't know who they are).
      await this.writeActivity({
        userId: null,
        eventType: "failed_login",
        severity: "warn",
        metadata: sanitizeMetadata({
          email,
          ip: ctx.ip,
          reason: error.name,
        }),
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      }).catch(() => {});

      // Map to a generic "invalid credentials" message — never reveal which
      // of email/password is wrong.
      throw mapSupabaseAuthError(error);
    }

    const user = data.user;
    if (!user) {
      throw new AuthenticationError("Sign-in failed. Please try again.");
    }

    // Success — clear the brute-force counter for this identity.
    await clearAttempts(ctx.bfKey);

    // Record the user_session row (UA/IP/device/geo). The SessionService
    // parses the UA internally; we just hand it the raw string.
    await this.sessionService
      .recordSession(user.id, {
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ip || null,
        // Mark this as the current session. The user_sessions.is_current flag
        // is best-effort — the SessionService does NOT clear prior is_current
        // rows on insert, so the dashboard may show multiple "current"
        // sessions until the older ones are revoked.
        isCurrent: true,
      })
      .catch((err) => {
        logger.warn("auth.signIn: session record failed", { error: String(err) });
      });

    await this.writeActivity({
      userId: user.id,
      eventType: "login",
      severity: "info",
      metadata: sanitizeMetadata({
        method: "email",
        ip: ctx.ip,
      }),
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    logger.info("auth.signIn: user signed in", { userId: user.id });
    return { user };
  }

  /**
   * Sign out the current user. Always logs a `logout` activity (best-effort).
   * Idempotent — calling signOut with no session is a no-op for Supabase but
   * still returns `void`.
   */
  async signOut(): Promise<void> {
    const ctx = await getSession();
    const userId = ctx?.user.id ?? null;

    const { error } = await this.supabase.auth.signOut();
    if (error) {
      logger.warn("auth.signOut: supabase returned error", {
        errorName: error.name,
        errorMessage: error.message,
      });
      // Continue — from the caller's POV the session is gone either way.
    }

    if (userId) {
      await this.writeActivity({
        userId,
        eventType: "logout",
        severity: "info",
        metadata: sanitizeMetadata({ method: "email" }),
      }).catch(() => {});
    }

    logger.info("auth.signOut: user signed out", { userId });
  }

  // -------------------------------------------------------------------------
  // Password reset + change flows
  // -------------------------------------------------------------------------

  /**
   * Request a password-reset email. ALWAYS returns successfully — never
   * reveals whether the email exists. The caller's route handler should
   * surface a generic "if an account exists, you'll receive an email"
   * message regardless.
   *
   * Logs the request (without revealing whether the email exists in the
   * user table) at info severity.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    const { error } = await this.supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      { redirectTo: `${env.app.url}/api/auth/callback?next=/reset-password` },
    );

    if (error) {
      // Supabase returns an error for invalid email format etc.; we still
      // don't want to leak whether the email exists. Log + return success.
      logger.warn("auth.requestPasswordReset: supabase returned error", {
        errorName: error.name,
        errorMessage: error.message,
      });
    }

    // Log the request — no userId since we don't know if the email maps to a
    // real user (and we deliberately don't look it up).
    await this.writeActivity({
      userId: null,
      eventType: "password_reset",
      severity: "info",
      metadata: sanitizeMetadata({ email: normalizedEmail, request: "initiate" }),
    }).catch(() => {});

    logger.info("auth.requestPasswordReset: reset email requested", {
      email: normalizedEmail,
    });
  }

  /**
   * Reset the password using the session established when the user clicked
   * the reset link. The route handler must enforce that a session exists
   * (the `requireAuth()` gate).
   *
   * Logs `password_reset` and creates a `security` notification.
   */
  async resetPassword(newPassword: string): Promise<void> {
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to reset your password.");
    }
    const userId = ctx.user.id;

    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw mapSupabaseAuthError(error);
    }

    await this.writeActivity({
      userId,
      eventType: "password_reset",
      severity: "info",
      metadata: sanitizeMetadata({ method: "reset_link" }),
    });

    await this.notificationService
      .create(userId, {
        type: "security",
        title: "Your password was changed",
        message:
          "Your account password was just changed. If this was you, no action is needed. If not, please contact support immediately.",
        actionUrl: "/settings/security",
        actionLabel: "Review security",
        metadata: { event: "password_reset" },
      })
      .catch((err) => {
        logger.warn("auth.resetPassword: notification failed", { error: String(err) });
      });

    logger.info("auth.resetPassword: password reset completed", { userId });
  }

  /**
   * Change the password for the currently-authenticated user. Requires
   * re-authentication with the current password (defense against a stolen
   * session cookie being used to lock the user out).
   *
   * After a successful change:
   *   - Revokes all other sessions (signs out other devices).
   *   - Logs `password_change`.
   *   - Creates a `security` notification.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to change your password.");
    }
    const userId = ctx.user.id;
    const email = ctx.user.email;
    if (!email) {
      throw new AuthenticationError("Account email is missing.");
    }

    // Re-authenticate with the current password. We use a FRESH server client
    // for this so the caller's existing session isn't disturbed if the
    // password is wrong.
    const reauthClient = await this.createPkcClient();
    const { error: reauthError } = await reauthClient.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (reauthError) {
      // Don't reveal whether the email exists — the caller is authenticated,
      // so we know it does, but the error message should still be generic.
      throw new AuthenticationError("Current password is incorrect.");
    }

    // Update the password on the caller's session client.
    const { error: updateError } = await this.supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      throw mapSupabaseAuthError(updateError);
    }

    // Revoke other sessions (best-effort). We don't have a stable session id
    // for the current one (the access_token rotates), so we pass `undefined`
    // for `exceptSessionId` — the SessionService will revoke every active
    // session. The current device will need to re-authenticate on the next
    // request, which is the desired security posture after a password change.
    await this.sessionService
      .revokeAllSessions(userId)
      .catch((err) => {
        logger.warn("auth.changePassword: revoke sessions failed", { error: String(err) });
      });

    await this.writeActivity({
      userId,
      eventType: "password_change",
      severity: "info",
      metadata: sanitizeMetadata({ method: "self_service" }),
    });

    await this.notificationService
      .create(userId, {
        type: "security",
        title: "Your password was changed",
        message:
          "Your account password was just changed and all other sessions were signed out. If this was you, no action is needed.",
        actionUrl: "/settings/security",
        actionLabel: "Review security",
        metadata: { event: "password_change" },
      })
      .catch((err) => {
        logger.warn("auth.changePassword: notification failed", { error: String(err) });
      });

    logger.info("auth.changePassword: password changed", { userId });
  }

  // -------------------------------------------------------------------------
  // Email change + verification flows
  // -------------------------------------------------------------------------

  /**
   * Initiate an email change. Supabase triggers its own email-change
   * verification flow (sends a confirmation email to the NEW address; the
   * change only lands when the user clicks the link).
   *
   * This method returns immediately — the change is NOT reflected on the
   * user's account until they verify the new email.
   */
  async changeEmail(newEmail: string): Promise<void> {
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to change your email.");
    }
    const userId = ctx.user.id;

    const { error } = await this.supabase.auth.updateUser({ email: newEmail });
    if (error) {
      // Map: "email already in use" → ConflictError.
      if (
        error.message.toLowerCase().includes("already") &&
        error.message.toLowerCase().includes("use")
      ) {
        throw new ConflictError("That email is already in use.");
      }
      throw mapSupabaseAuthError(error);
    }

    await this.writeActivity({
      userId,
      eventType: "email_change",
      severity: "info",
      metadata: sanitizeMetadata({ newEmail, status: "pending_verification" }),
    });

    logger.info("auth.changeEmail: email change requested", { userId });
  }

  /**
   * Verify an email using a token hash (the kind Supabase sends in the
   * signup / email-change confirmation links when using PKCE flow).
   *
   * `type` is the Supabase verifyOtp type ('signup' | 'email_change' |
   * 'recovery' | 'invite' | 'magiclink' | 'email').
   */
  async verifyEmail(
    tokenHash: string,
    type:
      | "signup"
      | "email_change"
      | "recovery"
      | "invite"
      | "magiclink"
      | "email",
  ): Promise<void> {
    const { data, error } = await this.supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      throw mapSupabaseAuthError(error);
    }

    const userId = data.user?.id;
    if (!userId) {
      // No session established — verification didn't bind to a user. Log + return.
      logger.info("auth.verifyEmail: verified without user", { type });
      return;
    }

    // Mark the profile's email_verified flag (best-effort).
    await this.profileService
      .markEmailVerified(userId)
      .catch((err) => {
        logger.warn("auth.verifyEmail: profile update failed", { error: String(err) });
      });

    await this.writeActivity({
      userId,
      eventType: "email_verified",
      severity: "info",
      metadata: sanitizeMetadata({ type }),
    });

    logger.info("auth.verifyEmail: email verified", { userId, type });
  }

  /**
   * Resend the signup verification email to the currently-authenticated user.
   * (Supabase also supports resending to an arbitrary email, but we require
   * a session so anonymous visitors can't enumerate accounts.)
   */
  async resendVerificationEmail(): Promise<void> {
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to resend the verification email.");
    }
    const userId = ctx.user.id;
    const email = ctx.user.email;
    if (!email) {
      throw new AuthenticationError("Account email is missing.");
    }

    const { error } = await this.supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${env.app.url}/api/auth/callback` },
    });

    if (error) {
      throw mapSupabaseAuthError(error);
    }

    logger.info("auth.resendVerification: sent", { userId });
  }

  // -------------------------------------------------------------------------
  // OAuth flows (PKCE)
  // -------------------------------------------------------------------------

  /**
   * Get the OAuth authorization URL for `provider`. Uses the PKCE flow
   * (code verifier + code challenge) so the callback can exchange the code
   * server-side without exposing a token in the URL fragment.
   *
   * Returns the URL only — the caller's browser navigates there.
   */
  async getOAuthSignInUrl(
    provider: OAuthProviderId,
    redirectTo?: string,
  ): Promise<string> {
    const safeRedirectTo =
      redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
        ? `${env.app.url}${redirectTo}`
        : `${env.app.url}/api/auth/callback`;

    const oauthClient = await this.createPkcClient();
    const { data, error } = await oauthClient.auth.signInWithOAuth({
      provider: provider as Provider,
      options: {
        redirectTo: safeRedirectTo,
        skipBrowserRedirect: true, // we want the URL, not a redirect
      },
    });

    if (error) {
      throw mapSupabaseAuthError(error);
    }

    if (!data?.url) {
      throw new ExternalServiceError("OAuth provider did not return a URL.");
    }

    logger.info("auth.oauth.signin: generated URL", { provider });
    return data.url;
  }

  /**
   * Exchange the OAuth `code` for a session. After exchange:
   *   - Logs `login` + `oauth_link` activities.
   *   - Records a `user_sessions` row.
   *   - Upserts a `linked_accounts` row for the provider.
   *
   * Called by the `/api/auth/callback` route handler.
   */
  async handleOAuthCallback(
    code: string,
    ctx: { ip: string; userAgent: string | null },
  ): Promise<OAuthCallbackResult> {
    const oauthClient = await this.createPkcClient();
    const { data, error } = await oauthClient.auth.exchangeCodeForSession(code);

    if (error) {
      throw mapSupabaseAuthError(error);
    }

    const user = data.user;
    if (!user) {
      throw new AuthenticationError("OAuth callback did not establish a session.");
    }

    // Extract the OAuth identity from the user's `identities` array.
    const oauthIdentity = user.identities?.[0];
    const providerName = oauthIdentity?.provider ?? "oauth";

    // Record the user_session row.
    await this.sessionService
      .recordSession(user.id, {
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ip || null,
        isCurrent: true,
      })
      .catch((err) => {
        logger.warn("auth.oauth.callback: session record failed", { error: String(err) });
      });

    // Upsert the linked_account. The unique (user_id, provider) constraint
    // means a re-link of an already-linked provider will throw — we swallow
    // that conflict (it's a no-op: the provider is already linked).
    if (oauthIdentity) {
      await this.linkedAccountsService
        .link(user.id, providerName, {
          providerAccountId: oauthIdentity.id ?? null,
          providerEmail:
            (oauthIdentity.identity_data?.email as string | undefined) ??
            user.email ??
            null,
          metadata: sanitizeMetadata({
            provider: providerName,
            linkedAt: new Date().toISOString(),
          }),
        })
        .catch((err) => {
          // ConflictError is expected when the provider is already linked —
          // log + continue. Other errors are also non-fatal here.
          logger.warn("auth.oauth.callback: linked account upsert failed", {
            error: String(err),
            provider: providerName,
          });
        });
    }

    await this.writeActivity({
      userId: user.id,
      eventType: "login",
      severity: "info",
      metadata: sanitizeMetadata({
        method: "oauth",
        provider: providerName,
        ip: ctx.ip,
      }),
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await this.writeActivity({
      userId: user.id,
      eventType: "oauth_link",
      severity: "info",
      metadata: sanitizeMetadata({ provider: providerName }),
    });

    logger.info("auth.oauth.callback: signed in", { userId: user.id, provider: providerName });
    return { user };
  }

  // -------------------------------------------------------------------------
  // Account management
  // -------------------------------------------------------------------------

  /**
   * Delete the caller's account. Requires the current password for
   * verification (defense against a stolen session cookie being used to
   * delete the account).
   *
   * Flow:
   *   1. Re-authenticate with the password (fresh client, doesn't touch the
   *      caller's session).
   *   2. Delegate row deletion to {@link accountService.deleteAccount} which
   *      uses the service-role client.
   *   3. Sign out (destroys the caller's session cookie).
   *   4. Log `account_deleted`.
   */
  async deleteAccount(password: string): Promise<void> {
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to delete your account.");
    }
    const userId = ctx.user.id;
    const email = ctx.user.email;
    if (!email) {
      throw new AuthenticationError("Account email is missing.");
    }

    // Re-authenticate (fresh client so a wrong password doesn't log out the caller).
    const reauthClient = await this.createPkcClient();
    const { error: reauthError } = await reauthClient.auth.signInWithPassword({
      email,
      password,
    });
    if (reauthError) {
      throw new AuthenticationError("Password is incorrect.");
    }

    // Delegate the destructive work to the account service (uses admin client).
    await this.accountService.deleteAccount(userId);

    // Sign out (best-effort).
    await this.supabase.auth.signOut().catch(() => {});

    await this.writeActivity({
      userId,
      eventType: "account_deleted",
      severity: "warn",
      metadata: sanitizeMetadata({ method: "self_service" }),
    });

    logger.info("auth.deleteAccount: account deleted", { userId });
  }

  /**
   * Request a GDPR data export. Returns a signed URL + expiry timestamp.
   * Delegates to {@link accountService.requestDataExport}.
   */
  async downloadMyData(): Promise<DownloadDataResult> {
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to download your data.");
    }
    const userId = ctx.user.id;

    const request = await this.accountService.requestDataExport(userId);

    if (!request.download_url || !request.expires_at) {
      throw new DatabaseError("Data export did not produce a download URL.");
    }

    logger.info("auth.downloadData: export completed", { userId, requestId: request.id });
    return {
      downloadUrl: request.download_url,
      expiresAt: request.expires_at,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Thin wrapper around the activity service so we don't have to repeat the
   * IP/User-Agent plumbing at every call site. The activity service is
   * itself responsible for using the admin client (RLS bypass) for inserts.
   */
  private async writeActivity(input: {
    userId: string | null;
    eventType: ActivityEventType | string;
    severity?: ActivitySeverity;
    metadata?: unknown;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.activityService.log(input.userId, input.eventType, {
      metadata: input.metadata,
      severity: input.severity ?? "info",
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  /**
   * Construct a server Supabase client configured for the PKCE auth flow.
   * Used by OAuth initiation + callback, and by re-authentication (we want
   * a fresh auth context so a wrong password doesn't log the caller out of
   * their existing session).
   *
   * Wires the same `cookies()` store as the regular server client so the
   * session lands in the user's cookie jar after `exchangeCodeForSession`.
   */
  private async createPkcClient(): Promise<ServerSupabaseClient> {
    const cookieStore = await cookies();
    return createServerClient<Database>(env.supabase.url, env.supabase.anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Same caveat as the regular server client: setting cookies from
            // a Server Component is a no-op (response already streaming).
            // The middleware will refresh the session on the next request.
          }
        },
      },
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build an {@link AuthService} bound to the current request. Per-request:
 * each call constructs a fresh service so the cookie store + the underlying
 * Supabase server client are correctly scoped.
 *
 * The async data-service factories are awaited here so the {@link AuthService}
 * constructor stays synchronous.
 */
export async function createAuthService(): Promise<AuthService> {
  const supabase = await createSupabaseServerClient();
  const [profileService, sessionService, notificationService, linkedAccountsService] =
    await Promise.all([
      createProfileService(),
      createSessionService(),
      createNotificationService(),
      createLinkedAccountsService(),
    ]);
  const activityService = createActivityLogService();
  const accountService = createAccountService();

  return new AuthService({
    supabase,
    profileService,
    sessionService,
    notificationService,
    activityService,
    accountService,
    linkedAccountsService,
  });
}

// Re-export the IP extractor from helpers so route handlers don't need to
// import from two places.
export { getClientIp } from "@/lib/auth/helpers";
