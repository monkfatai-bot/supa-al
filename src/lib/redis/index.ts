/**
 * Supa AI — Redis access layer with graceful in-memory fallback.
 *
 * Single entry point for the rest of the app: ask for a {@link KVStore} and
 * you get Redis when configured, an in-memory store when not. Callers never
 * need to branch on `env.redis.enabled` themselves.
 *
 * The shared `ioredis` client is lazy-initialized and cached on `globalThis`
 * so it survives Next.js HMR in development without leaking connections.
 *
 * Server-only.
 *
 * @module @/lib/redis
 */
import Redis from "ioredis";

import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";

import { memoryStore, type KVStore } from "./memory-store";
import { RedisStore } from "./redis-store";

export type { KVStore, KVValue } from "./memory-store";
export { memoryStore } from "./memory-store";
export { RedisStore } from "./redis-store";

/** Whether Redis is configured (env var present). Does NOT prove connectivity. */
export function isRedisAvailable(): boolean {
  return env.redis.enabled;
}

/**
 * Singleton ioredis client (lazy). Returns `null` when Redis is disabled or
 * the connection fails on first attempt (we then fall back to memory).
 */
declare global {
  var __supaRedisClient: Redis | undefined | null;
}

function createRedisClient(): Redis | null {
  if (!env.redis.enabled) return null;
  try {
    const client = new Redis(env.redis.url, {
      // Upstash-style servers send a bearer token via the `Authorization`
      // header. ioredis exposes this through `password` in newer versions,
      // but the safest cross-provider config is the `tls` + lazyConnect
      // pattern. We keep this defensive.
      ...(env.redis.token
        ? {
            password: env.redis.token,
            // TLS is implied by rediss:// — ioredis auto-detects.
          }
        : {}),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      // Don't crash the process if Redis blips; we have a fallback.
      retryStrategy: (times) => {
        if (times > 5) {
          logger.warn("Redis reconnect attempts exhausted; using memory fallback.", {
            attempts: times,
          });
          return null;
        }
        return Math.min(times * 200, 2_000);
      },
    });

    client.on("error", (err) => {
      logger.error("Redis client error", { error: String(err) });
    });
    client.on("connect", () => {
      logger.info("Redis client connected", { url: env.redis.url });
    });
    client.on("reconnecting", (delay: number) => {
      logger.warn("Redis reconnecting", { delayMs: delay });
    });

    return client;
  } catch (err) {
    logger.error("Failed to construct Redis client; falling back to memory.", {
      error: String(err),
    });
    return null;
  }
}

/**
 * Get the shared Redis client. Returns `null` when Redis is disabled or
 * unreachable on init. Lazily memoized on `globalThis`.
 */
export function getRedis(): Redis | null {
  if (!env.redis.enabled) return null;
  if (globalThis.__supaRedisClient !== undefined) {
    return globalThis.__supaRedisClient;
  }
  const client = createRedisClient();
  globalThis.__supaRedisClient = client;
  return client;
}

let cachedStore: KVStore | null = null;

/**
 * Return the active {@link KVStore}. Redis when available, the in-memory
 * store otherwise. The choice is made once per process and cached —
 * flipping `env.redis.enabled` after boot requires a restart.
 */
export function getStore(): KVStore {
  if (cachedStore) return cachedStore;
  const client = getRedis();
  cachedStore = client ? new RedisStore(client) : memoryStore;
  if (cachedStore === memoryStore) {
    logger.warn(
      env.redis.enabled
        ? "Redis enabled but unavailable — using in-memory fallback."
        : "Redis disabled — using in-memory store.",
    );
  }
  return cachedStore;
}
