/**
 * Supa AI — Rate limit presets.
 *
 * Centralized limit/window pairs so every API route applies the same policy
 * for a given resource class. Tune here, not at call sites.
 *
 * @module @/lib/rate-limit/presets
 */

export interface RateLimitPreset {
  /** Maximum requests permitted within the window. */
  limit: number;
  /** Window size in seconds. */
  windowSec: number;
}

/**
 * Phase 1 presets. Limits are per-IP (or per-user when authenticated) and
 * enforced via the {@link KVStore} counter pattern.
 */
export const RATE_LIMIT_PRESETS = {
  /** Login/signup attempts — strict to slow credential brute force. */
  AUTH: { limit: 10, windowSec: 60 } satisfies RateLimitPreset,
  /** Generic authenticated API routes. */
  API: { limit: 120, windowSec: 60 } satisfies RateLimitPreset,
  /** AI generation endpoints — heavier cost, tighter limit. */
  AI_GENERATION: { limit: 30, windowSec: 60 } satisfies RateLimitPreset,
  /** File uploads — bandwidth sensitive. */
  UPLOAD: { limit: 20, windowSec: 60 } satisfies RateLimitPreset,
  /** Truly sensitive operations (e.g. delete account, key rotation). */
  STRICT: { limit: 5, windowSec: 300 } satisfies RateLimitPreset,
} as const;

export type RateLimitPresetName = keyof typeof RATE_LIMIT_PRESETS;
