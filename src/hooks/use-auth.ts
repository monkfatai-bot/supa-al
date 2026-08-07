"use client";

/**
 * Supa AI — auth hooks (Phase 2 UI).
 *
 * TanStack Query hooks wrapping every `/api/auth/*` route that the auth
 * screens consume. Each mutation returns the unwrapped `data` on success and
 * throws an {@link AuthApiError} payload (`{code, message, details?}`) on
 * failure so forms can render it via `<AuthErrorAlert>`.
 *
 * Design notes:
 *
 *   - All requests use **relative paths** (never an absolute URL) so the
 *     gateway can route them. `credentials: "include"` so the Supabase
 *     session cookie is sent + accepted.
 *   - 401 from `/api/auth/me` is a valid "no session" state, not a transport
 *     error — `useAuth()` returns `{user: null}` in that case.
 *   - `useSignOut` calls `router.refresh()` after the request resolves so the
 *     server component re-evaluates the session cookie and swaps the rendered
 *     tree from the dashboard back to the auth flow without a full reload.
 *   - `useOAuthSignIn` is the one mutation that does NOT set the session
 *     cookie itself — it returns `{url}` and the caller does
 *     `window.location.href = url` to start the PKCE redirect chain.
 *
 * @module @/hooks/use-auth
 */
import { useMutation, useQuery, type UseMutationOptions } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type { ApiResponse, ApiError as ApiErrorPayload } from "@/types/api";
import type { AuthUser, Profile } from "@/lib/auth";
import type { OauthProvider } from "@/lib/validation/auth";

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

/**
 * The structured error that mutations throw. Mirrors the `error` field of the
 * `ApiResponse` failure envelope so forms can render `{code, message,
 * details}` via `<AuthErrorAlert>`.
 */
export type AuthApiError = ApiErrorPayload;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return parseAuthResponse<T>(res);
}

/**
 * Parse a `Response` carrying the {@link ApiResponse} envelope. On success
 * returns the unwrapped `data`; on failure throws the `error` payload so
 * TanStack Query surfaces it as the mutation's `error` field.
 */
async function parseAuthResponse<T>(res: Response): Promise<T> {
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw {
      code: "INTERNAL_ERROR",
      message: "Unexpected response from the server. Please try again.",
    } satisfies AuthApiError;
  }

  if (json && json.success === true) {
    return json.data;
  }

  if (json && json.success === false) {
    throw json.error as AuthApiError;
  }

  // Malformed body — defensive fallback (should never happen).
  throw {
    code: "INTERNAL_ERROR",
    message: "Unexpected response from the server. Please try again.",
  } satisfies AuthApiError;
}

// ---------------------------------------------------------------------------
// Response data shapes (mirrors the API routes' return values)
// ---------------------------------------------------------------------------

/** Shape of `GET /api/auth/me` success data (after the dashboard spread). */
export interface MeData {
  user: AuthUser;
  profile: Profile | null;
  settings: unknown;
  unreadNotificationCount: number;
  recentActivity: unknown[];
  recentNotifications: unknown[];
  creditsBalance: number;
  plan: Profile["subscription_plan"];
}

export interface SignUpResult {
  user: AuthUser;
  needsEmailVerification: boolean;
}

export interface SignInResult {
  user: AuthUser;
}

export interface ForgotPasswordResult {
  requested: true;
}

export interface ResetPasswordResult {
  reset: true;
}

export interface VerifyEmailResult {
  verified: true;
}

export interface ResendVerificationResult {
  sent: true;
}

export interface OAuthSignInResult {
  url: string;
}

export interface SignOutResult {
  signedOut: true;
}

// ---------------------------------------------------------------------------
// useAuth — current session query
// ---------------------------------------------------------------------------

export interface UseAuthResult {
  user: AuthUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** `true` while a background refetch is in flight (e.g. after `router.refresh()`). */
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * Fetch the current authenticated user + profile via `GET /api/auth/me`.
 * Returns `null` user on 401 (no session).
 */
export function useAuth(): UseAuthResult {
  const query = useQuery<MeData | null>({
    queryKey: ["auth", "me"],
    queryFn: async ({ signal }): Promise<MeData | null> => {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        signal,
      });
      // 401 is the canonical "no session" response — not a transport error.
      if (res.status === 401) return null;
      return parseAuthResponse<MeData>(res);
    },
    retry: 1,
    staleTime: 60 * 1000,
  });

  const user = query.data?.user ?? null;
  const profile = query.data?.profile ?? null;

  return {
    user,
    profile,
    isLoading: query.isLoading,
    isAuthenticated: user !== null,
    isFetching: query.isFetching,
    refetch: () => query.refetch(),
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface SignUpPayload {
  email: string;
  password: string;
  displayName?: string;
  acceptTerms: boolean;
}

/**
 * `POST /api/auth/signup` — register a new user.
 */
export function useSignUp(
  options?: UseMutationOptions<SignUpResult, AuthApiError, SignUpPayload>,
) {
  return useMutation<SignUpResult, AuthApiError, SignUpPayload>({
    mutationKey: ["auth", "signup"],
    mutationFn: (input) =>
      postJson<SignUpResult>("/api/auth/signup", {
        email: input.email,
        password: input.password,
        displayName: input.displayName,
        acceptTerms: input.acceptTerms,
      }),
    ...options,
  });
}

export interface SignInPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * `POST /api/auth/signin` — authenticate with email + password.
 */
export function useSignIn(
  options?: UseMutationOptions<SignInResult, AuthApiError, SignInPayload>,
) {
  return useMutation<SignInResult, AuthApiError, SignInPayload>({
    mutationKey: ["auth", "signin"],
    mutationFn: (input) =>
      postJson<SignInResult>("/api/auth/signin", {
        email: input.email,
        password: input.password,
        rememberMe: input.rememberMe,
      }),
    ...options,
  });
}

/**
 * `POST /api/auth/signout` — destroy the current session. After the server
 * confirms sign-out, calls `router.refresh()` so the server component
 * re-evaluates the session cookie and swaps from dashboard → auth flow. Also
 * invalidates the `["auth","me"]` query so a subsequent re-login doesn't
 * show stale user data.
 */
export function useSignOut(
  options?: UseMutationOptions<SignOutResult, AuthApiError, void>,
) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation<SignOutResult, AuthApiError, void>({
    mutationKey: ["auth", "signout"],
    mutationFn: () => postJson<SignOutResult>("/api/auth/signout", {}),
    onSuccess: async (...args) => {
      // Drop cached session data before navigating back so the auth UI
      // doesn't briefly render the previous user.
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.setQueryData(["auth", "me"], null);
      router.refresh();
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export interface ForgotPasswordPayload {
  email: string;
}

/**
 * `POST /api/auth/forgot-password` — request a password reset email. The
 * server ALWAYS returns success regardless of whether the email maps to a
 * real account (anti-enumeration).
 */
export function useForgotPassword(
  options?: UseMutationOptions<ForgotPasswordResult, AuthApiError, ForgotPasswordPayload>,
) {
  return useMutation<ForgotPasswordResult, AuthApiError, ForgotPasswordPayload>({
    mutationKey: ["auth", "forgot-password"],
    mutationFn: (input) =>
      postJson<ForgotPasswordResult>("/api/auth/forgot-password", {
        email: input.email,
      }),
    ...options,
  });
}

export interface ResetPasswordPayload {
  password: string;
  confirmPassword: string;
}

/**
 * `POST /api/auth/reset-password` — set a new password using the session
 * established by the reset email link. Requires a session (the callback
 * route set it).
 */
export function useResetPassword(
  options?: UseMutationOptions<ResetPasswordResult, AuthApiError, ResetPasswordPayload>,
) {
  return useMutation<ResetPasswordResult, AuthApiError, ResetPasswordPayload>({
    mutationKey: ["auth", "reset-password"],
    mutationFn: (input) =>
      postJson<ResetPasswordResult>("/api/auth/reset-password", {
        password: input.password,
        confirmPassword: input.confirmPassword,
      }),
    ...options,
  });
}

export interface OAuthSignInPayload {
  provider: OauthProvider;
  redirectTo?: string;
}

/**
 * `POST /api/auth/oauth/signin` — fetch the provider's OAuth authorization
 * URL. The caller then navigates the browser to that URL to start the PKCE
 * flow. Does NOT set a session itself — the callback route does that.
 */
export function useOAuthSignIn(
  options?: UseMutationOptions<OAuthSignInResult, AuthApiError, OAuthSignInPayload>,
) {
  return useMutation<OAuthSignInResult, AuthApiError, OAuthSignInPayload>({
    mutationKey: ["auth", "oauth", "signin"],
    mutationFn: (input) =>
      postJson<OAuthSignInResult>("/api/auth/oauth/signin", {
        provider: input.provider,
        redirectTo: input.redirectTo,
      }),
    ...options,
  });
}

export interface VerifyEmailPayload {
  tokenHash: string;
  type: "signup" | "email_change" | "recovery" | "invite" | "magiclink" | "email";
}

/**
 * `POST /api/auth/verify-email` — exchange a token hash (from the email
 * verification link) for a verified email.
 */
export function useVerifyEmail(
  options?: UseMutationOptions<VerifyEmailResult, AuthApiError, VerifyEmailPayload>,
) {
  return useMutation<VerifyEmailResult, AuthApiError, VerifyEmailPayload>({
    mutationKey: ["auth", "verify-email"],
    mutationFn: (input) =>
      postJson<VerifyEmailResult>("/api/auth/verify-email", {
        tokenHash: input.tokenHash,
        type: input.type,
      }),
    ...options,
  });
}

/**
 * `POST /api/auth/resend-verification` — re-send the signup verification
 * email. Requires a session.
 */
export function useResendVerification(
  options?: UseMutationOptions<ResendVerificationResult, AuthApiError, void>,
) {
  return useMutation<ResendVerificationResult, AuthApiError, void>({
    mutationKey: ["auth", "resend-verification"],
    mutationFn: () =>
      postJson<ResendVerificationResult>("/api/auth/resend-verification", {}),
    ...options,
  });
}

export type { OauthProvider };
