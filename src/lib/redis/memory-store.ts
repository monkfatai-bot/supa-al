/**
 * Supa AI — In-memory key/value store with TTL.
 *
 * This is the canonical {@link KVStore} contract that both the Redis-backed
 * store and the in-memory fallback implement. It is deliberately minimal so
 * it can be backed by anything (Redis, Memcached, a Map) without leaking
 * transport details into call sites.
 *
 * Used by: rate limiter, feature flag overrides, ephemeral session storage.
 *
 * Server-only: uses Node timers + a global singleton; never import on client.
 *
 * @module @/lib/redis/memory-store
 */

/** JSON-serializable value stored in the KV layer. */
export type KVValue = string | number | boolean | object | null;

/**
 * Minimal key/value contract used across rate limiting, feature flags,
 * and short-lived caches. Implementations must be safe to call concurrently.
 */
export interface KVStore {
  /** Read a key. Returns `null` when missing or expired. */
  get(key: string): Promise<KVValue | null>;
  /** Write a key with an optional TTL in seconds. */
  set(key: string, value: KVValue, ttlSec?: number): Promise<void>;
  /** Delete a key. No-op when missing. */
  del(key: string): Promise<void>;
  /**
   * Atomically increment a counter and return the new value. If the key did
   * not exist it is created with value `1`. When `windowSec` is provided and
   * the key is freshly created, the TTL is set so the counter auto-expires
   * at the end of the window (fixed-window rate limiting).
   */
  incr(key: string, windowSec?: number): Promise<number>;
}

interface MemoryEntry {
  value: KVValue;
  expiresAt: number | null; // epoch ms; null = no expiry
}

const SWEEP_INTERVAL_MS = 60_000;
const MAX_ENTRIES = 5_000;

/**
 * In-memory {@link KVStore}. Sweeps expired entries on a 60s timer to bound
 * memory growth. Suitable for development and single-instance deploys.
 */
class MemoryStore implements KVStore {
  private readonly map = new Map<string, MemoryEntry>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Only schedule sweep in a long-lived process (i.e. server, not edge).
    if (typeof process !== "undefined" && typeof setInterval === "function") {
      this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
      // Allow the process to exit even if the timer is alive.
      if (this.sweepTimer && typeof this.sweepTimer.unref === "function") {
        this.sweepTimer.unref();
      }
    }
  }

  async get(key: string): Promise<KVValue | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: KVValue, ttlSec?: number): Promise<void> {
    this.maybeEvict();
    const expiresAt =
      typeof ttlSec === "number" && ttlSec > 0
        ? Date.now() + ttlSec * 1000
        : null;
    this.map.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async incr(key: string, windowSec?: number): Promise<number> {
    const existing = this.map.get(key);
    const now = Date.now();
    if (
      existing &&
      (existing.expiresAt === null || existing.expiresAt > now) &&
      typeof existing.value === "number"
    ) {
      const next = existing.value + 1;
      this.map.set(key, { value: next, expiresAt: existing.expiresAt });
      return next;
    }
    // Fresh counter — apply TTL only when a window is provided.
    const expiresAt =
      typeof windowSec === "number" && windowSec > 0
        ? now + windowSec * 1000
        : null;
    this.maybeEvict();
    this.map.set(key, { value: 1, expiresAt });
    return 1;
  }

  /** Remove expired entries. O(n) over the map; called on a timer. */
  private sweep(): void {
    const now = Date.now();
    for (const [k, entry] of this.map) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.map.delete(k);
      }
    }
  }

  /** Bound memory usage in pathological cases. */
  private maybeEvict(): void {
    if (this.map.size < MAX_ENTRIES) return;
    const now = Date.now();
    // First pass: drop expired.
    for (const [k, entry] of this.map) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.map.delete(k);
      }
    }
    // Still too big? Evict oldest by insertion order (FIFO).
    if (this.map.size >= MAX_ENTRIES) {
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
  }
}

/**
 * Shared in-memory store singleton. Survives HMR by living on `globalThis`.
 */
declare global {
  var __supaMemoryStore: KVStore | undefined;
}

export const memoryStore: KVStore =
  globalThis.__supaMemoryStore ?? (globalThis.__supaMemoryStore = new MemoryStore());
