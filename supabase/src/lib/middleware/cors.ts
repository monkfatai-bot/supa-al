/**
 * Supa AI — CORS middleware helpers.
 *
 * Two small, dependency-free helpers for working with CORS in API routes:
 *
 * - {@link corsHeaders} returns a plain `HeadersInit` you can spread into
 *   `new Response()` or `NextResponse.next()`.
 * - {@link applyCors} is a convenience for mutating an existing `Headers`
 *   object in place (useful when composing middleware).
 *
 * Origin resolution:
 * 1. If `origin` is provided and is in the allow-list (or `*` is allowed),
 *    echo it back via `Access-Control-Allow-Origin`.
 * 2. Otherwise fall back to the configured app URL (`env.app.url`) so that
 *    same-origin browser requests continue to work.
 *
 * In production we intentionally avoid reflecting arbitrary request origins
 * — only the explicit allow-list (currently just the app URL) is permitted.
 *
 * @module @/lib/middleware/cors
 */

import { env } from "@/lib/config/env";

/**
 * Allowed origins. Extended from `env.app.url`; future work can read an
 * additional allow-list from the database or env without touching call
 * sites.
 */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  [env.app.url].filter((url): url is string => Boolean(url)),
);

/**
 * Build a CORS `HeadersInit` for the given request origin.
 *
 * @param origin The `Origin` header value from the inbound request, if any.
 * @returns A `HeadersInit` ready to merge into a `Response`.
 */
export function corsHeaders(origin?: string | null): HeadersInit {
  const resolved =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : env.app.url;

  return {
    "Access-Control-Allow-Origin": resolved,
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Requested-With, X-Request-Id",
    "Access-Control-Expose-Headers": "X-Request-Id, X-RateLimit-Remaining",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Apply CORS headers to an existing `Headers` instance in place. Useful
 * when a response has already been created by another layer and you only
 * need to layer CORS on top.
 *
 * @example
 * const res = NextResponse.next();
 * applyCors(res.headers, request.headers.get("origin"));
 */
export function applyCors(headers: Headers, origin?: string | null): void {
  const cors = corsHeaders(origin);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
}
