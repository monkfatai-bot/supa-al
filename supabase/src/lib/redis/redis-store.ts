/**
 * Supa AI — Redis-backed {@link KVStore}.
 *
 * Thin adapter around `ioredis` implementing the same contract as
 * {@link memoryStore}. `incr` uses the canonical INCR + EXPIRE pattern for
 * fixed-window rate limiting: the first increment sets the TTL, subsequent
 * increments within the window reuse it.
 *
 * Server-only.
 *
 * @module @/lib/redis/redis-store
 */
import type { Redis } from "ioredis";

import { ExternalServiceError } from "@/lib/errors";
import { logger } from "@/lib/logger";

import type { KVStore, KVValue } from "./memory-store";

/** JSON-serialize values so we can store booleans/numbers/objects intact. */
function encode(value: KVValue): string {
  return JSON.stringify(value);
}

function decode(raw: string | null): KVValue | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as KVValue;
  } catch {
    // Not JSON — return as-is string.
    return raw;
  }
}

export class RedisStore implements KVStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<KVValue | null> {
    try {
      const raw = await this.redis.get(key);
      return decode(raw);
    } catch (err) {
      logger.error("Redis get failed", { key, error: String(err) });
      throw new ExternalServiceError("Redis get failed.", {
        cause: String(err),
      });
    }
  }

  async set(key: string, value: KVValue, ttlSec?: number): Promise<void> {
    try {
      const serialized = encode(value);
      if (typeof ttlSec === "number" && ttlSec > 0) {
        // SET with EX is atomic.
        await this.redis.set(key, serialized, "EX", ttlSec);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (err) {
      logger.error("Redis set failed", { key, error: String(err) });
      throw new ExternalServiceError("Redis set failed.", {
        cause: String(err),
      });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      logger.error("Redis del failed", { key, error: String(err) });
      throw new ExternalServiceError("Redis del failed.", {
        cause: String(err),
      });
    }
  }

  /**
   * INCR + EXPIRE pattern. The EXPIRE is only set on the first increment
   * (when the key was just created). This implements a fixed-window counter:
   * the first request in a window starts the clock; subsequent requests
   * just bump the counter until the window elapses and the key evaporates.
   *
   * We deliberately tolerate a tiny race between INCR returning 1 and EXPIRE
   * — if the process dies between them, the counter lives without TTL until
   * the next window or manual eviction. This is acceptable for rate limiting
   * (worst case: one user gets a slightly longer window once).
   */
  async incr(key: string, windowSec?: number): Promise<number> {
    try {
      const count = await this.redis.incr(key);
      if (count === 1 && typeof windowSec === "number" && windowSec > 0) {
        await this.redis.expire(key, windowSec);
      }
      return count;
    } catch (err) {
      logger.error("Redis incr failed", { key, error: String(err) });
      throw new ExternalServiceError("Redis incr failed.", {
        cause: String(err),
      });
    }
  }

  /** Ping the underlying connection (health checks). */
  async ping(): Promise<boolean> {
    try {
      const res = await this.redis.ping();
      return res === "PONG";
    } catch {
      return false;
    }
  }
}
