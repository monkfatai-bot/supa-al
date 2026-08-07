/**
 * Supa AI — Supabase OAuth / email-code callback.
 *
 * GET `/api/auth/callback` — the single redirect target for every Supabase
 * auth email link + every OAuth provider redirect. Handles three cases:
 *
 *   1. `?error=...` — the OAuth provider (or Supabase) returned an error.
 *      Redirect to `/?auth_error=<error>` so the login page can surface it.
 *
 *   2. `?code=...` — PKCE exchange. Calls `authService.handleOAuthCallback`
 *      which exchanges the code for a session (server-side), records the
 *      user_session row, logs `login` + `oauth_link` activities, and upserts
 *      the linked_account row.
 *
 *   3. Neither — missing code. Redirect to `/?auth_error=missing_code`.
 *
 * On success the user is redirected to the `next` query param (when it's a
 * safe same-origin relative path) or to `/?auth=success` otherwise. We NEVER
 * accept an absolute URL or `//`-prefixed value as `next` (open-redirect
 * defense).
 *
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import { NextResponse } from "next/server";

import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createAuthService } from "@/lib/auth/auth-service";
import { getClientIp } from "@/lib/auth/helpers";
\n// OAuth callbacks are request-time endpoints. Never attempt to statically\n// collect or pre-render this route during a production build.\nexport const dynamic = "force-dynamic";\n
/**
 * Validate that `next` is a same-origin relative URL. We only accept paths
 * starting with `/` and reject anything that looks like a scheme-relative
 * URL (`//evil.com`) to avoid open-redirect attacks.
 */
function safeRedirectPath(next: string | null): string {
  if (!next) return "/?auth=success";
  if (!next.startsWith("/")) return "/?auth=success";
  if (next.startsWith("//")) return "/?auth=success";
  // Decode + re-encode to catch encoded variants of `//`.
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.startsWith("//") || decoded.startsWith("http")) {
      return "/?auth=success";
    }
  } catch {
    return "/?auth=success";
  }
  return next;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorCode = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const nextParam = url.searchParams.get("next");
  const next = safeRedirectPath(nextParam);

  // Case 1: OAuth provider / Supabase returned an error.
  if (errorCode) {
    logger.warn("auth.callback: OAuth error", {
      errorCode,
      errorDescription,
    });
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(errorCode)}`, url.origin),
    );
  }

  // Case 3: No code at all.
  if (!code) {
    logger.warn("auth.callback: missing code parameter");
    return NextResponse.redirect(
      new URL("/?auth_error=missing_code", url.origin),
    );
  }

  // Case 2: PKCE code exchange.
  try {
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent");

    const authService = await createAuthService();
    await authService.handleOAuthCallback(code, { ip, userAgent });

    logger.info("auth.callback: session established", { redirect: next });
    return NextResponse.redirect(new URL(next, url.origin));
  } catch (err) {
    const appErr = toAppError(err);
    logger.error("auth.callback: exchange failed", {
      code: appErr.code,
      message: appErr.message,
    });
    // Map well-known error codes to short, client-displayable slugs.
    const slug =
      appErr.code === "AUTHENTICATION_ERROR"
        ? "auth_failed"
        : appErr.code === "RATE_LIMIT_ERROR"
        ? "rate_limited"
        : "exchange_failed";
    return NextResponse.redirect(
      new URL(`/?auth_error=${slug}`, url.origin),
    );
  }
}
