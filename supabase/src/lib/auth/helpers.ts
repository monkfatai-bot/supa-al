/**
 * Supa AI — Auth-layer shared utilities.
 *
 * Server-only helpers used by every Phase 2 auth service:
 *   - {@link parseUserAgent}  — dependency-free UA → device / os / browser parser.
 *   - {@link getClientIp}     — IP extraction from request headers (with fallbacks).
 *   - {@link sanitizeMetadata} — deep-sanitize arbitrary objects before they hit
 *     `activity_logs.metadata` (strips any key that looks like a secret).
 *
 * @module @/lib/auth/helpers
 */
import "server-only";

import type { NextRequest } from "next/server";

import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Structural view of a Supabase client that exposes the two API surfaces
 * the Phase 2 services use: Postgrest (`from`) and Storage (`storage`).
 *
 * Both the per-request RLS-enforced {@link ServerSupabaseClient} and the
 * service-role {@link AdminSupabaseClient} are assignable to this type,
 * so service classes can accept either. The narrower `Pick` (vs the full
 * `SupabaseClient<...>`) sidesteps a known signature mismatch between
 * `@supabase/supabase-js` and `@supabase/ssr`'s generic defaults that
 * makes the union of the two clients non-callable on `.from()`.
 */
export type AnySupabaseClient = Pick<AdminSupabaseClient, "from" | "storage">;

/** Compile-time assertion that {@link ServerSupabaseClient} satisfies {@link AnySupabaseClient}. */
const _SERVER_CLIENT_IS_ASSIGNABLE: (c: ServerSupabaseClient) => AnySupabaseClient = (c) => c;
void _SERVER_CLIENT_IS_ASSIGNABLE;

/** Shape returned by {@link parseUserAgent}. */
export interface ParsedUserAgent {
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  os: string;
  browser: string;
}

/** Canonical "unknown" result returned when the UA string is empty / unrecognized. */
const UNKNOWN_UA: ParsedUserAgent = Object.freeze({
  deviceType: "unknown",
  os: "unknown",
  browser: "unknown",
});

/**
 * Lightweight, dependency-free User-Agent parser. Detects device type
 * (mobile / tablet / desktop), major OS, and major browser. Returns
 * `"unknown"` for any field it cannot determine.
 *
 * The implementation favors correctness over completeness: it covers the
 * browsers + OSes that make up >99% of real traffic (Chrome, Safari,
 * Firefox, Edge, Opera, Samsung Internet; iOS, macOS, Windows, Android,
 * Linux, ChromeOS) and falls back gracefully on unknown UAs.
 */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || typeof ua !== "string") return { ...UNKNOWN_UA };
  const uaLower = ua.toLowerCase();
  if (!uaLower) return { ...UNKNOWN_UA };

  // --- Device type ---------------------------------------------------------
  let deviceType: ParsedUserAgent["deviceType"] = "desktop";
  // Tablets first (the iPad UA on iOS 13+ looks like Mac OS X, so check iPad
  // explicitly before falling through to "desktop").
  if (
    /ipad/.test(uaLower) ||
    /tablet/.test(uaLower) ||
    /playbook/.test(uaLower) ||
    /silk/.test(uaLower) ||
    /\bandroid(?!.*mobile)\b/.test(uaLower)
  ) {
    deviceType = "tablet";
  } else if (
    /iphone/.test(uaLower) ||
    /ipod/.test(uaLower) ||
    /android.*mobile/.test(uaLower) ||
    /windows phone/.test(uaLower) ||
    /blackberry/.test(uaLower) ||
    /bb10/.test(uaLower) ||
    /opera mini/.test(uaLower) ||
    /mobile/.test(uaLower) ||
    /silk/.test(uaLower)
  ) {
    deviceType = "mobile";
  }

  // --- OS ------------------------------------------------------------------
  let os = "unknown";
  if (/windows nt 10/.test(uaLower)) os = "Windows";
  else if (/windows nt 6\.3/.test(uaLower)) os = "Windows 8.1";
  else if (/windows nt 6\.2/.test(uaLower)) os = "Windows 8";
  else if (/windows nt 6\.1/.test(uaLower)) os = "Windows 7";
  else if (/windows/.test(uaLower)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(uaLower)) {
    // Extract iOS version when possible.
    const m = /cpu (?:iphone )?os (\d+)[_\d]*/.exec(uaLower);
    os = m ? `iOS ${m[1]}` : "iOS";
  } else if (/mac os x|macintosh/.test(uaLower)) {
    const m = /mac os x (\d+)[_\d]*/.exec(uaLower);
    os = m ? `macOS ${m[1]}` : "macOS";
  } else if (/android/.test(uaLower)) {
    const m = /android (\d+)/.exec(uaLower);
    os = m ? `Android ${m[1]}` : "Android";
  } else if (/cros/.test(uaLower)) os = "ChromeOS";
  else if (/linux/.test(uaLower)) os = "Linux";
  else if (/crkey/.test(uaLower)) os = "Chromecast";

  // --- Browser -------------------------------------------------------------
  // Order matters: Edge, Opera, and Samsung spoof Chrome / Safari.
  let browser = "unknown";
  if (/edg\//.test(uaLower) || /edge\//.test(uaLower)) browser = "Edge";
  else if (/opr\/|opera/.test(uaLower)) browser = "Opera";
  else if (/samsungbrowser/.test(uaLower)) browser = "Samsung Internet";
  else if (/firefox\//.test(uaLower)) browser = "Firefox";
  else if (/chrome\//.test(uaLower) && !/chromium/.test(uaLower)) browser = "Chrome";
  else if (/chromium/.test(uaLower)) browser = "Chromium";
  else if (/version\/[\d.]+.*safari/.test(uaLower) || /safari\//.test(uaLower))
    browser = "Safari";
  else if (/msie|trident/.test(uaLower)) browser = "IE";

  return { deviceType, os, browser };
}

/**
 * Extract the client IP address from request headers. Inspects
 * `x-forwarded-for` (first entry), then `x-real-ip`, then the optional
 * `request.ip` field that Next.js (Vercel) populates. Returns `"unknown"`
 * if no IP can be determined.
 *
 * The returned value is suitable for storing in `user_sessions.ip_address`
 * or `activity_logs.ip_address`. It is NOT a security boundary — it can be
 * spoofed by the client. Use it only for telemetry / audit context.
 */
export function getClientIp(request: Request | NextRequest): string {
  const headers = request.headers;

  // `x-forwarded-for: client, proxy1, proxy2` — take the first entry.
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  // Next.js (Vercel) populates `request.ip` on the NextRequest type. Defensively
  // read it through a cast — it may be undefined on self-hosted deployments.
  const maybeIp = (request as { ip?: string }).ip;
  if (maybeIp) return maybeIp;

  return "unknown";
}

/**
 * Keys whose values must NEVER land in `activity_logs.metadata`. The regex
 * is deliberately broad: any key containing the substrings `token`, `secret`,
 * `password`, `key`, `auth`, or `credential` is dropped before logging.
 */
const SECRET_KEY_PATTERN = /token|secret|password|passwd|key|auth|credential|bearer|cookie|session/i;

/**
 * Deep-sanitize an arbitrary value so it is safe to persist in
 * `activity_logs.metadata`.
 *
 *   - Object keys matching {@link SECRET_KEY_PATTERN} are removed.
 *   - All other values are normalized to JSON-safe primitives (Date → ISO,
 *     Error → `{name,message}`, RegExp → string, BigInt → string).
 *   - Functions, Symbols, and `undefined` are dropped.
 *   - Arrays are recursively sanitized; nulls preserved.
 *
 * The output is always a plain JSON-safe record. If the input is a primitive
 * (string / number / etc.), it is wrapped as `{ value: <input> }`.
 */
export function sanitizeMetadata(obj: unknown): Record<string, unknown> {
  const cleaned = sanitizeValue(obj);
  if (cleaned !== null && typeof cleaned === "object" && !Array.isArray(cleaned)) {
    return cleaned as Record<string, unknown>;
  }
  // Wrap non-object values so the return type is always a Record.
  return { value: cleaned };
}

/**
 * Recursively sanitize a value. Returns `null` for anything that cannot be
 * safely serialized (functions, symbols, undefined).
 */
function sanitizeValue(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input === "function" || typeof input === "symbol") return null;
  if (typeof input === "string") return input;
  if (typeof input === "number") return input;
  if (typeof input === "boolean") return input;
  if (typeof input === "bigint") return input.toString();
  if (input instanceof Date) return input.toISOString();
  if (input instanceof RegExp) return input.toString();
  if (input instanceof Error) {
    return { name: input.name, message: input.message };
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeValue).filter((v) => v !== null);
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) continue;
      const child = sanitizeValue(v);
      if (child !== null) out[k] = child;
    }
    return out;
  }
  return null;
}
