"use client";

/**
 * Supa AI — `useSettings` (Phase 2 account settings hooks).
 *
 * TanStack Query hooks that wrap every `/api/auth/*` and `/api/profile/*`
 * + `/api/settings/*` + `/api/linked-accounts/*` endpoint the Phase 2
 * account-settings UI consumes. Every hook returns the standard
 * TanStack Query result; mutations invalidate the relevant query keys so
 * the UI stays in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, fields?, code? }` shape via {@link unwrapApiError}.
 *
 * @module @/hooks/use-settings
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ApiResponse,
} from "@/types/api";
import type {
  LinkedAccount,
  Profile,
  UpdateProfileInput,
  UpdateSettingsInput,
  UserSession,
  UserSettings,
} from "@/lib/auth";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const settingsKeys = {
  profile: ["settings", "profile"] as const,
  settings: ["settings", "user-settings"] as const,
  sessions: ["settings", "sessions"] as const,
  linkedAccounts: ["settings", "linked-accounts"] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Normalized error shape consumed by the UI: a single top-level message,
 * an optional map of per-field validation messages, and the upstream code
 * for telemetry.
 */
export interface SettingsApiError {
  message: string;
  code?: string;
  /** Map of `fieldPath -> message` (from `ValidationError.details.fields`). */
  fields?: Record<string, string>;
}

/**
 * Parse a non-OK fetch response into a {@link SettingsApiError}. The
 * `/api/*` routes return the standard `ApiResponse<never>` failure envelope
 * (`{success:false, error:{code, message, details}}`) — when the code is
 * `VALIDATION_ERROR`, `details.fields` is an array of `{path, message}`
 * which we collapse into a `Record<string,string>` for easy field lookup.
 */
async function unwrapApiError(res: Response): Promise<SettingsApiError> {
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    return {
      message: `Request failed (${res.status}).`,
    };
  }

  const envelope = raw as ApiResponse<never>;
  if (envelope && envelope.success === false && envelope.error) {
    const fields = envelope.error.details?.fields as
      | Array<{ path: string; message: string }>
      | undefined;
    const fieldMap: Record<string, string> | undefined = fields
      ? fields.reduce<Record<string, string>>((acc, f) => {
          if (f?.path) acc[f.path] = f.message;
          return acc;
        }, {})
      : undefined;
    return {
      message: envelope.error.message,
      code: envelope.error.code,
      fields: fieldMap,
    };
  }
  return { message: `Request failed (${res.status}).` };
}

/**
 * Issue a JSON request and either return the typed `data` payload or throw
 * a {@link SettingsApiError}. Caller decides what's "an error" — both
 * network failures and non-2xx responses throw.
 */
async function apiRequest<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(url, init);
  if (!res.ok) {
    throw await unwrapApiError(res);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    // The envelope itself reported failure despite a 2xx — shouldn't happen,
    // but handle it defensively.
    throw {
      message: json.error?.message ?? "Unexpected response shape.",
      code: json.error?.code,
    } as SettingsApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Extended profile-update input. The data service's `UpdateProfileInput`
 * omits `avatar_url` (avatar writes flow through `ProfileService.updateAvatar`
 * server-side), but the `/api/profile/update` route accepts `avatar_url`
 * so the avatar upload component can reuse the same endpoint. A `null`
 * value clears the avatar.
 */
export interface ProfileUpdateRequest extends UpdateProfileInput {
  avatar_url?: string | null;
}

/** POST `/api/profile/update` — partial-update the caller's profile. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdateRequest) =>
      apiRequest<Profile>("POST", "/api/profile/update", input),
    onSuccess: (profile) => {
      qc.setQueryData(settingsKeys.profile, profile);
      // The `/api/auth/me` query (owned by `useUser`) also carries the
      // profile; invalidate it so the user-menu + dashboard reflect the
      // change on the next read.
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

// ---------------------------------------------------------------------------
// User settings
// ---------------------------------------------------------------------------

/** PATCH `/api/settings/update` — partial-update the caller's settings. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) =>
      apiRequest<UserSettings>("PATCH", "/api/settings/update", input),
    onSuccess: (settings) => {
      qc.setQueryData(settingsKeys.settings, settings);
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Shape returned by GET `/api/auth/sessions`. */
export interface SessionsListResponse {
  sessions: UserSession[];
  /** Identifier of the caller's current session (raw access token). */
  currentSessionId: string;
}

/** GET `/api/auth/sessions` — list the caller's active sessions. */
export function useListSessions(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.sessions,
    queryFn: () => apiRequest<SessionsListResponse>("GET", "/api/auth/sessions"),
    enabled,
    staleTime: 30 * 1000,
  });
}

/** DELETE `/api/auth/sessions/:id` — revoke one session. */
export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<{ revoked: boolean }>(
        "DELETE",
        `/api/auth/sessions/${encodeURIComponent(sessionId)}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.sessions });
    },
  });
}

/** DELETE `/api/auth/sessions` — revoke every session EXCEPT the current. */
export function useRevokeAllSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ revoked: boolean }>("DELETE", "/api/auth/sessions"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.sessions });
    },
  });
}

// ---------------------------------------------------------------------------
// Account mutations (password / email / deletion / data export)
// ---------------------------------------------------------------------------

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** POST `/api/auth/change-password` — change password (re-auth required). */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiRequest<{ changed: boolean }>(
        "POST",
        "/api/auth/change-password",
        input,
      ),
  });
}

export interface ChangeEmailInput {
  newEmail: string;
}

/** POST `/api/auth/change-email` — initiate an email change. */
export function useChangeEmail() {
  return useMutation({
    mutationFn: (input: ChangeEmailInput) =>
      apiRequest<{ pendingVerification: boolean }>(
        "POST",
        "/api/auth/change-email",
        input,
      ),
  });
}

export interface DeleteAccountInput {
  password: string;
  confirm: "DELETE";
}

/** POST `/api/auth/delete-account` — permanently delete the caller's account. */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteAccountInput) =>
      apiRequest<{ deleted: boolean }>(
        "POST",
        "/api/auth/delete-account",
        input,
      ),
    onSuccess: () => {
      // After deletion the session is gone — clear every cache so the
      // post-sign-out UI doesn't render stale data.
      qc.clear();
    },
  });
}

/** Shape returned by POST `/api/auth/download-data`. */
export interface DownloadDataResult {
  downloadUrl: string;
  expiresAt: string;
}

/** POST `/api/auth/download-data` — request a 7-day signed-URL data export. */
export function useDownloadData() {
  return useMutation({
    mutationFn: () =>
      apiRequest<DownloadDataResult>("POST", "/api/auth/download-data"),
  });
}

// ---------------------------------------------------------------------------
// Linked accounts
// ---------------------------------------------------------------------------

/** GET `/api/linked-accounts` — list the caller's linked providers. */
export function useListLinkedAccounts(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.linkedAccounts,
    queryFn: () =>
      apiRequest<{ accounts: LinkedAccount[] }>("GET", "/api/linked-accounts"),
    enabled,
    staleTime: 30 * 1000,
  });
}

/** DELETE `/api/linked-accounts/:provider` — unlink a provider. */
export function useUnlinkAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) =>
      apiRequest<{ unlinked: boolean }>(
        "DELETE",
        `/api/linked-accounts/${encodeURIComponent(provider)}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.linkedAccounts });
    },
  });
}

export interface OAuthSigninInput {
  provider: "google" | "github" | "microsoft" | "apple";
  /** Relative path to land on after OAuth callback (e.g. `/`). */
  redirectTo?: string;
}

export interface OAuthSigninResult {
  url: string;
}

/**
 * POST `/api/auth/oauth/signin` — fetch the OAuth authorization URL for the
 * supplied provider. The caller `window.location.assign(url)` to start the
 * PKCE flow; Supabase redirects back to `/api/auth/callback?code=...`.
 *
 * Implemented as a plain async helper (not `useMutation`) so callers can
 * `await` it inside an `onClick` without juggling a hook lifecycle.
 */
export async function requestOAuthSignin(
  input: OAuthSigninInput,
): Promise<string> {
  return apiRequest<OAuthSigninResult>("POST", "/api/auth/oauth/signin", input).then(
    (r) => r.url,
  );
}
