/**
 * Supa AI — generic in-memory TTL cache.
 *
 * A framework-agnostic, dependency-free `Map`-backed cache with per-entry
 * TTL, O(1) read/write, and a background sweep that runs lazily on `set()`
 * to evict expired entries. Used as the fallback cache implementation
 * when Redis is not configured (development, single-instance deployments).
 *
 * Concurrency notes:
 * - Operations are synchronous; no locks are needed because Node's
 *   single-threaded event loop guarantees atomic Map mutations.
 * - The sweep is scheduled via `setTimeout` so it never blocks the
 *   caller of `set()`. A single sweep is coalesced per sweep window.
 *
 * @module @/lib/cache
 */

import { logger } from "@/lib/logger";

/** Internal cache entry. `expiresAt === 0` means "never expires". */
interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/** Constructor options for {@link MemoryCache}. */
export interface MemoryCacheOptions {
  /** Default TTL applied when `set()` is called without an explicit `ttlMs`. `0` = never. */
  defaultTtlMs?: number;
  /** Minimum interval between lazy sweeps, in ms. Default 60_000. */
  sweepIntervalMs?: number;
  /** Optional label for log lines (e.g. "rate-limit"). */
  label?: string;
}

/**
 * Generic in-memory TTL cache.
 *
 * @example
 * const cache = new MemoryCache<string, User>({ defaultTtlMs: 60_000 });
 * cache.set(userId, user);
 * const hit = cache.get(userId); // User | undefined
 */
export class MemoryCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();
  private readonly defaultTtlMs: number;
  private readonly sweepIntervalMs: number;
  private readonly label: string;
  private sweepScheduled = false;

  constructor(opts: MemoryCacheOptions = {}) {
    this.defaultTtlMs = opts.defaultTtlMs ?? 0;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? 60_000;
    this.label = opts.label ?? "memory-cache";
  }

  /**
   * Read a value by key. Returns `undefined` when the key is missing or
   * its TTL has expired (expired entries are evicted eagerly on read).
   */
  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt !== 0 && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Write a value. `ttlMs` overrides the cache default; pass `0` to store
   * indefinitely. Triggers a lazy background sweep when one is not already
   * scheduled.
   */
  set(key: K, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
    this.store.set(key, { value, expiresAt });
    this.scheduleSweep();
  }

  /** Delete a key. Returns `true` if the key was present. */
  delete(key: K): boolean {
    return this.store.delete(key);
  }

  /** Remove all keys and values. */
  clear(): void {
    this.store.clear();
  }

  /** Whether a key exists and has not expired. Does *not* eagerly evict. */
  has(key: K): boolean {
    const entry = this.store.get(key);
    if (entry === undefined) return false;
    if (entry.expiresAt !== 0 && entry.expiresAt <= Date.now()) {
      return false;
    }
    return true;
  }

  /** Current entry count (includes expired entries not yet swept). */
  get size(): number {
    return this.store.size;
  }

  /**
   * Schedule a single background sweep. Multiple `set()` calls within the
   * sweep window coalesce into one sweep to amortize cost.
   */
  private scheduleSweep(): void {
    if (this.sweepScheduled) return;
    this.sweepScheduled = true;
    setTimeout(() => {
      this.sweepScheduled = false;
      this.sweep();
    }, this.sweepIntervalMs);
  }

  /**
   * Iterate the store and delete every expired entry. Bounded by the
   * current size of the cache, so it is O(n) — but runs off the hot path.
   */
  private sweep(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== 0 && entry.expiresAt <= now) {
        this.store.delete(key);
        evicted += 1;
      }
    }
    if (evicted > 0) {
      logger.debug("memory-cache sweep", {
        cache: this.label,
        evicted,
        remaining: this.store.size,
      });
    }
  }
}
