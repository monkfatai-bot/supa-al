/**
 * Supa AI — secure HTTP response headers.
 *
 * Returns a record of baseline security headers (CSP, X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, Permissions-Policy) suitable
 * for spreading into any `Response` / `NextResponse`.
 *
 * The Content-Security-Policy is composed dynamically from `env.app.url`
 * so that development and production share the same source-of-truth
 * origin without hardcoding.
 *
 * @module @/lib/middleware/security-headers
 */

import { env } from "@/lib/config/env";

/**
 * Compose the platform-wide Content-Security-Policy directive.
 *
 * - `default-src 'self'` is the conservative base.
 * - `connect-src` whitelists the app origin + Supabase + AI providers so
 *   client-side fetches (auth, RSC streaming, AI streaming) work without
 *   ad-hoc `<meta>` overrides.
 * - `img-src` is permissive of `data:` (used by avatars / previews).
 *
 * The function takes an optional `appUrl` so tests can assert deterministic
 * output without depending on `env`.
 */
export function composeCsp(appUrl: string): string {
  const self = "'self'";
  const supabase = env.supabase.url ?? appUrl;
  const directives: Record<string, string> = {
    "default-src": self,
    "script-src": `${self} 'unsafe-inline' 'unsafe-eval'`,
    "style-src": `${self} 'unsafe-inline'`,
    "img-src": `${self} data: https: blob:`,
    "font-src": `${self} data:`,
    "connect-src": [
      self,
      appUrl,
      supabase,
      "https://api.openai.com",
      "https://api.anthropic.com",
      "https://generativelanguage.googleapis.com",
      "https://openrouter.ai",
      "https://api.deepseek.com",
      "https://dashscope-intl.aliyuncs.com",
      "https://api.x.ai",
    ].join(" "),
    "frame-ancestors": "'none'",
    "form-action": self,
    "base-uri": self,
    "object-src": "'none'",
    "upgrade-insecure-requests": "",
  };
  return Object.entries(directives)
    .map(([k, v]) => (v ? `${k} ${v}` : k))
    .join("; ");
}

/**
 * Build the full set of baseline secure headers for a response. The CSP
 * is composed from `env.app.url`; pass an explicit `appUrl` only in tests.
 */
export function securityHeaders(appUrl: string = env.app.url): Record<string, string> {
  return {
    "Content-Security-Policy": composeCsp(appUrl),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
    "X-DNS-Prefetch-Control": "on",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

/**
 * Apply the secure headers to an existing `Headers` instance in place.
 * Useful when composing middleware where the response has already been
 * created.
 */
export function applySecurityHeaders(
  headers: Headers,
  appUrl?: string,
): void {
  for (const [key, value] of Object.entries(securityHeaders(appUrl))) {
    headers.set(key, value);
  }
}
