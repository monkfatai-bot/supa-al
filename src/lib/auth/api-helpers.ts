/**
 * Supa AI — API route helpers.
 *
 * Standardized envelope constructors + auth gates for the `/api/auth/*` (and
 * future `/api/*`) route handlers. Every route should:
 *
 *   1. Validate input with Zod (throws `ValidationError`).
 *   2. Call `requireAuth()` (or `requirePermission()`) when the route is
 *      protected.
 *   3. Invoke the service layer.
 *   4. Return `apiSuccess(data)` on the happy path.
 *   5. Catch-all and return `apiError(err)` — never let an exception bubble.
 *
 * The envelope shape is `ApiResponse<T>` (see `@/types/api`):
 *
 * ```jsonc
 * // success
 * { "success": true, "data": {...}, "meta": { "timestamp": "..." } }
 * // failure
 * { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...} } }
 * ```
 *
 * Server-only: relies on `getCurrentUser` which imports `next/headers`.
 *
 * @module @/lib/auth/api-helpers
 */
import "server-only";

import { NextResponse } from "next/server";

import type { ApiResponse, ApiError as ApiErrorPayload, ApiMeta } from "@/types/api";
import { AppError, AuthorizationError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

import { getCurrentUser, type AuthUser } from "./session";

// ---------------------------------------------------------------------------
// Success / failure envelopes
// ---------------------------------------------------------------------------

/**
 * Build a 200 `NextResponse` carrying the {@link ApiResponse} success
 * envelope. An optional `meta` block can be attached (timestamp, pagination,
 * rate-limit info).
 *
 * @example
 * ```ts
 * return apiSuccess({ user });
 * return apiSuccess({ sessions }, { pagination: { hasMore: false } });
 * ```
 */
export function apiSuccess<T>(
  data: T,
  meta?: ApiMeta,
): NextResponse<ApiResponse<T>> {
  const body: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
  return NextResponse.json(body, { status: 200 });
}

/**
 * Normalize any thrown value into an {@link AppError}, log it (with severity
 * matching the error class), and return a `NextResponse` carrying the
 * {@link ApiResponse} failure envelope.
 *
 * - `internal: false` errors (validation, auth, rate-limit, etc.) are returned
 *   at their `statusCode` and their message is safe to surface to clients.
 * - `internal: true` errors (database, storage, configuration) are returned at
 *   `500` with a generic message ("An internal error occurred.") so internals
 *   never leak to clients. The original message + code are logged.
 * - When `status` is provided, it overrides the error's `statusCode`.
 *
 * Honors the `Retry-After` header on `RateLimitError` (seconds).
 */
export function apiError(
  error: unknown,
  status?: number,
): NextResponse<ApiResponse<never>> {
  const appErr = toAppError(error);
  const statusCode = status ?? appErr.statusCode ?? 500;

  // Decide what's safe to log + return.
  const safeForClient = appErr.internal === false;
  const clientMessage = safeForClient
    ? appErr.message
    : "An internal error occurred. Please try again.";

  const payload: ApiErrorPayload = {
    code: appErr.code,
    message: clientMessage,
    details: safeForClient ? appErr.details : undefined,
  };

  // Log: internal errors are ERROR, user-facing errors are DEBUG (they're
  // expected — bad input, auth, rate-limit). 500s are always ERROR.
  const logLevel = statusCode >= 500 ? "error" : safeForClient ? "debug" : "error";
  logger[logLevel]("api.error", {
    code: appErr.code,
    statusCode,
    message: appErr.message,
    internal: appErr.internal,
    details: appErr.details,
  });

  const body: ApiResponse<never> = {
    success: false,
    error: payload,
    meta: { timestamp: new Date().toISOString() },
  };

  const headers: Record<string, string> = {};
  // RateLimitError carries `retryAfter` in its details — surface it as the
  // standard `Retry-After` header so clients can honor it.
  const retryAfter = (appErr.details?.retryAfter as number | undefined) ?? null;
  if (typeof retryAfter === "number" && retryAfter > 0) {
    headers["Retry-After"] = String(Math.ceil(retryAfter));
  }

  return NextResponse.json(body, { status: statusCode, headers });
}

// ---------------------------------------------------------------------------
// Auth gates
// ---------------------------------------------------------------------------

/**
 * Resolve the current authenticated user or throw {@link AppError}
 * (`AUTHENTICATION_ERROR`, 401). Use at the top of every protected route.
 *
 * @example
 * ```ts
 * export async function POST(req: NextRequest) {
 *   try {
 *     const user = await requireAuth();
 *     // ...
 *     return apiSuccess({ ok: true });
 *   } catch (err) {
 *     return apiError(err);
 *   }
 * }
 * ```
 */
export async function requireAuth(): Promise<AuthUser> {
  return getCurrentUser();
}

/**
 * Assert that `user` has `permission`. Throws {@link AuthorizationError}
 * (403) when not permitted.
 *
 * Note: `user` here is the Supabase `User` shape. We extract the platform
 * role from `app_metadata.platform_role` (set on signup) and the org role
 * from `app_metadata.role`. The {@link hasPermission} helper falls back
 * gracefully when neither is set (returns `false`).
 */
export function requirePermission(
  user: AuthUser | null | undefined,
  permission: Permission,
): void {
  if (!user) {
    throw new AuthorizationError("Sign in to continue.");
  }
  const platformRole = (user.app_metadata?.platform_role as string | undefined) ?? null;
  const role = (user.app_metadata?.role as string | undefined) ?? null;
  if (!hasPermission({ id: user.id, platformRole, role }, permission)) {
    throw new AuthorizationError("You are not authorized to perform this action.");
  }
}
