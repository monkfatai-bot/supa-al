/**
 * Rate limiting foundation for server-side use.
 *
 * Uses an in-memory sliding window counter suitable for single-instance
 * deployments. For multi-instance production setups, replace the store
 * with Redis or Upstash.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** In-memory store: key → { count, resetAt } */
const store = new Map<string, RateLimitEntry>();

/** How often to sweep expired entries (ms). */
const SWEEP_INTERVAL = 60_000;
let lastSweep = Date.now();

function sweepExpired() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL) return;
  lastSweep = now;
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Number of requests allowed in the window. Default: 10. */
  limit?: number;
  /** Window duration in seconds. Default: 60. */
  windowSeconds?: number;
}

/**
 * Check (and increment) a rate limit for the given key.
 * Returns whether the request is allowed and how many are remaining.
 */
export function rateLimit(
  key: string,
  options?: RateLimitOptions,
): RateLimitResult {
  const limit = options?.limit ?? 10;
  const windowMs = (options?.windowSeconds ?? 60) * 1000;

  sweepExpired();

  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { success: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { success: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/**
 * Reset the rate limit for a given key (e.g. on logout).
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Get current rate limit status without incrementing.
 */
export function getRateLimitStatus(
  key: string,
  limit: number = 10,
): { remaining: number; resetAt: number } | null {
  sweepExpired();
  const existing = store.get(key);
  if (!existing) return null;
  return { remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}
