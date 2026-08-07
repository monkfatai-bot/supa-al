/**
 * Supa AI — security constants.
 *
 * Named rate-limit presets, upload constraints, default CORS origins, and
 * baseline secure HTTP headers. These are platform-wide defaults; route-
 * specific overrides should be the exception, not the rule.
 *
 * @module @/lib/constants/security
 */

/** Sliding-window rate limit configuration. */
export interface RateLimitConfig {
  /** Window size in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed within the window. */
  max: number;
}

/**
 * Named rate-limit presets. Each named preset is tuned for the cost profile
 * of the route family it governs:
 *
 * - `auth`   — sign-in / sign-up / reset (tight, anti-abuse).
 * - `api`    — generic authenticated API surface.
 * - `ai`     — AI generation endpoints (expensive upstream calls).
 * - `upload` — file uploads (bandwidth-bound).
 */
export const RATE_LIMIT_PRESETS = {
  auth: { windowMs: 15 * 60 * 1000, max: 10 },
  api: { windowMs: 60 * 1000, max: 60 },
  ai: { windowMs: 60 * 1000, max: 20 },
  upload: { windowMs: 60 * 1000, max: 10 },
} as const satisfies Readonly<Record<string, RateLimitConfig>>;

/** Names of the available rate-limit presets. */
export type RateLimitPresetName = keyof typeof RATE_LIMIT_PRESETS;

/**
 * MIME types accepted by the upload pipeline. Keep this list tight — every
 * entry is also an extension of trust surface area.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
] as const;

/** MIME type accepted by the upload pipeline. */
export type AllowedUploadMimeType =
  (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

/** Hard ceiling on uploaded file size (10 MB). */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Default CORS allowed origins. The runtime CORS middleware
 * (`@/lib/middleware/cors`) extends this with `env.app.url`.
 */
export const CORS_DEFAULT_ORIGINS = [] as const;

/**
 * Baseline secure HTTP headers applied to every response. CSP is intentionally
 * not included here — it is composed dynamically by `securityHeaders()` in
 * `@/lib/middleware/security-headers` because it depends on the request env.
 */
export const SECURE_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
} as const;
