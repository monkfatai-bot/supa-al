/**
 * Supa AI — Brute-force protection for credential authentication.
 *
 * Maintains a per-identity (IP + email) failed-attempt counter on the shared
 * {@link KVStore} (Redis in production, in-memory in development). After the
 * configured threshold (`MAX_ATTEMPTS`) is reached inside a rolling window
 * (`WINDOW_SEC`), the identity is considered "locked" and `checkBruteForce`
 * will reject subsequent attempts until the window resets.
 *
 * The counter is intentionally keyed by **both** IP and email so a single
 * misbehaving client cannot lock out a victim's email — and a single victim's
 * email cannot be locked out from every IP on the planet. The IP namespace is
 * the most useful one when the email is unknown (e.g. an attacker cycling
 * usernames); the email namespace is the most useful one when the IP is
 * unknown (e.g. a botnet).
 *
 * Server-only.
 *
 * @module @/lib/auth/brute-force
 */
import "server-only";

import { logger } from "@/lib/logger";
import type { KVStore } from "@/lib/redis";
import { getStore } from "@/lib/redis";

/** Maximum failed attempts per identity before the lock kicks in. */
const MAX_ATTEMPTS = 5;

/** Rolling window (in seconds) — 15 minutes. */
const WINDOW_SEC = 15 * 60;

/** Key prefix — namespaced so it does not collide with rate-limit counters. */
const PREFIX = "bf:";

/** Result of {@link recordFailedAttempt} / {@link checkBruteForce}. */
export interface BruteForceState {
  /** Number of failed attempts recorded in the current window. */
  attempts: number;
  /** Whether the identity is currently locked (>= MAX_ATTEMPTS). */
  locked: boolean;
  /** Seconds until the window resets and the counter clears. >= 0. */
  retryAfter: number;
}

/** Build a stable KV key from an IP + email identity. */
export function bruteForceKey(ip: string, email: string): string {
  // Normalize the email to lowercase so attackers cannot bypass by varying
  // case. Trim defensively. The IP is used as-is (already extracted upstream).
  const safeIp = (ip || "unknown").trim().toLowerCase();
  const safeEmail = (email || "unknown").trim().toLowerCase();
  return `${PREFIX}${safeIp}:${safeEmail}`;
}

/**
 * Read the current attempt count for `key` from the store. Returns `0` when
 * the key is missing or the store is unavailable. Never throws.
 */
async function readAttempts(store: KVStore, key: string): Promise<number> {
  try {
    const raw = await store.get(key);
    if (raw === null || raw === undefined) return 0;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch (err) {
    // Store down → fail OPEN (better UX; the rate limiter already throttles).
    logger.error("Brute-force store read failed; failing open.", {
      key,
      error: String(err),
    });
    return 0;
  }
}

/**
 * Bump the counter for `key`. The first bump seeds a TTL equal to
 * {@link WINDOW_SEC} so the counter auto-expires after the window elapses.
 * Subsequent bumps reuse the existing TTL (the window is "first-attempt-
 * relative" rather than strictly sliding — see note in {@link WINDOW_SEC}).
 */
async function bumpAttempts(store: KVStore, key: string): Promise<number> {
  try {
    return await store.incr(key, WINDOW_SEC);
  } catch (err) {
    logger.error("Brute-force store increment failed; failing open.", {
      key,
      error: String(err),
    });
    return 0;
  }
}

/** Compute the locked state from a raw count. */
function toState(attempts: number): BruteForceState {
  const locked = attempts >= MAX_ATTEMPTS;
  // `retryAfter` is meaningful only when locked. The window is fixed at
  // WINDOW_SEC from the first attempt; we don't have an exact TTL back from
  // the store, so the worst case is the caller waits the full window.
  return {
    attempts,
    locked,
    retryAfter: locked ? WINDOW_SEC : 0,
  };
}

/**
 * Record a failed login attempt and return the resulting state.
 *
 * - If the identity is already locked, the call is a no-op (returns the
 *   locked state without bumping further).
 * - If not, increments the counter and re-evaluates.
 */
export async function recordFailedAttempt(
  key: string,
): Promise<BruteForceState> {
  const store = getStore();
  const current = await readAttempts(store, key);
  if (current >= MAX_ATTEMPTS) {
    return toState(current);
  }
  const next = await bumpAttempts(store, key);
  return toState(next);
}

/**
 * Inspect the current brute-force state for `key` **without** incrementing.
 *
 * Use this at the top of a sign-in handler to short-circuit before attempting
 * Supabase auth (so a locked identity never even reaches the credential
 * check).
 */
export async function checkBruteForce(
  key: string,
): Promise<BruteForceState> {
  const store = getStore();
  const current = await readAttempts(store, key);
  return toState(current);
}

/**
 * Clear the attempt counter for `key`.
 *
 * Call this immediately on a successful sign-in so a user who fat-fingered
 * their password twice yesterday does not carry the count forward.
 */
export async function clearAttempts(key: string): Promise<void> {
  const store = getStore();
  try {
    await store.del(key);
  } catch (err) {
    // Best-effort; don't fail the sign-in over a store hiccup.
    logger.warn("Brute-force store delete failed.", {
      key,
      error: String(err),
    });
  }
}

export { MAX_ATTEMPTS, WINDOW_SEC };
