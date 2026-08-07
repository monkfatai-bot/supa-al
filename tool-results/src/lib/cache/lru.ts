/**
 * Supa AI — bounded LRU cache.
 *
 * A simple, dependency-free Least-Recently-Used cache built on top of a
 * JavaScript `Map`, which iterates in insertion order. Reads refresh
 * insertion order; inserts evict the oldest entry when capacity is reached.
 * All operations are amortized O(1).
 *
 * Use for bounded in-process memoization (e.g. parsed prompt templates,
 * small derived payloads). For TTL semantics, use {@link MemoryCache} from
 * `@/lib/cache` instead.
 *
 * @module @/lib/cache/lru
 */

/**
 * Generic LRU cache.
 *
 * @example
 * const lru = new LRUCache<string, User>(100);
 * lru.set(id, user);
 * lru.get(id); // refreshes recency
 */
export class LRUCache<K, V> {
  private readonly store: Map<K, V>;
  private readonly max: number;

  /**
   * @param max Maximum number of entries before eviction begins. Must be ≥ 1.
   * @throws {RangeError} when `max < 1`.
   */
  constructor(max = 100) {
    if (max < 1) {
      throw new RangeError("LRUCache: max must be >= 1");
    }
    this.max = max;
    this.store = new Map();
  }

  /**
   * Read a value, refreshing its recency. Returns `undefined` on miss.
   * The refresh is implemented as delete-then-set to move the entry to
   * the end of the Map's insertion order.
   */
  get(key: K): V | undefined {
    const value = this.store.get(key);
    if (value === undefined) return undefined;
    // Move to most-recent position.
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  /**
   * Insert or update a value. When at capacity and the key is new,
   * evicts the least-recently-used entry first.
   */
  set(key: K, value: V): void {
    if (this.store.has(key)) {
      // Refresh recency by re-inserting.
      this.store.delete(key);
    } else if (this.store.size >= this.max) {
      // Evict oldest entry (first key in iteration order).
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, value);
  }

  /** Whether the key is present. Does not refresh recency. */
  has(key: K): boolean {
    return this.store.has(key);
  }

  /** Delete a key. Returns `true` if it was present. */
  delete(key: K): boolean {
    return this.store.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Current entry count. */
  get size(): number {
    return this.store.size;
  }

  /** Maximum entry count. */
  get capacity(): number {
    return this.max;
  }
}
