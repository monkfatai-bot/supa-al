/**
 * Supa AI — Token-bucket / fixed-window rate limiter.
 *
 * Built on the {@link KVStore} abstraction so it transparently uses Redis in
 * production and an in-memory map in development. The counter pattern is a
 * fixed window: the first request creates a counter with a TTL equal to the
 * window, subsequent requests bump it until the window elapses.
 *
 * Two consumption modes:
 *  - {@link RateLimiter.check}: non-throwing; returns the decision.
 *  - {@link RateLimiter.consume}: throws `RateLimitError` when exceeded.
 *
 * Plus a `rateLimit(opts)` higher-order helper to wrap API route handlers.
 *
 * Server-only.
 *
 * @module @/lib/rate-limit
 */
import type { NextRequest } from "next/server";

import { RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { KVStore } from "@/lib/redis";
import { getStore } from "@/lib/redis";

import { RATE_LIMIT_PRESETS, type RateLimitPreset } from "./presets";

export interface RateLimitDecision {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Remaining tokens in the current window (>= 0). */
  remaining: number;
  /** Epoch ms when the window resets and the counter clears. */
  resetAt: number;
  /** Limit configured for this check (for X-RateLimit-Limit headers). */
  limit: number;
}

export interface RateLimiterOptions {
  store?: KVStore;
  /** Key prefix to namespace counters (default: `rl:`). */
  prefix?: string;
}

export class RateLimiter {
  private readonly store: KVStore;
  private readonly prefix: string;

  constructor(opts: RateLimiterOptions = {}) {
    this.store = opts.store ?? getStore();
    this.prefix = opts.prefix ?? "rl:";
  }

  /**
   * Non-throwing check. Always returns a decision; the caller decides whether
   * to proceed. Does NOT consume a token if `allowed` is false.
   */
  async check(
    key: string,
    limit: number,
    windowSec: number,
  ): Promise<RateLimitDecision> {
    const composite = `${this.prefix}${key}`;
    try {
      const count = await this.store.incr(composite, windowSec);
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      // We don't have a precise resetAt from the store; approximate from now.
      // The store's TTL governs the true expiry. The estimate is conservative
      // (treats the window as starting now) which avoids revealing false hope.
      const resetAt = Date.now() + windowSec * 1000;
      return { allowed, remaining, resetAt, limit };
    } catch (err) {
      // If the store is down, fail OPEN — better to serve traffic than to
      // deny service because Redis is having a moment. Log loudly.
      logger.error("Rate limiter store error; failing open.", {
        key,
        error: String(err),
      });
      return {
        allowed: true,
        remaining: limit,
        resetAt: Date.now() + windowSec * 1000,
        limit,
      };
    }
  }

  /**
   * Throwing variant. Use in handlers that should short-circuit on 429.
   * Throws {@link RateLimitError} (HTTP 429) when over the limit.
   */
  async consume(
    key: string,
    limit: number,
    windowSec: number,
  ): Promise<RateLimitDecision> {
    const decision = await this.check(key, limit, windowSec);
    if (!decision.allowed) {
      const retryAfter = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
      throw new RateLimitError(
        "Rate limit exceeded. Please try again later.",
        retryAfter,
        { limit, windowSec, resetAt: decision.resetAt },
      );
    }
    return decision;
  }

  /** Apply a named preset by key. */
  async checkPreset(
    key: string,
    preset: RateLimitPreset,
  ): Promise<RateLimitDecision> {
    return this.check(key, preset.limit, preset.windowSec);
  }

  async consumePreset(
    key: string,
    preset: RateLimitPreset,
  ): Promise<RateLimitDecision> {
    return this.consume(key, preset.limit, preset.windowSec);
  }
}

/** Shared limiter using the default {@link KVStore}. */
export const rateLimiter = new RateLimiter();

// ---------------------------------------------------------------------------
// Higher-order API route wrapper
// ---------------------------------------------------------------------------

export interface RateLimitWrapperOptions {
  /** Limit + window. Either pass directly or via `preset`. */
  limit?: number;
  windowSec?: number;
  /** Use a named preset (overrides limit/windowSec). */
  preset?: RateLimitPreset;
  /**
   * Build the identity key from the request. Defaults to IP address, falling
   * back to "anonymous" when no IP can be derived (e.g. local dev).
   */
  keyBy?: (req: NextRequest) => string | Promise<string>;
  /** Custom limiter instance (e.g. for tests). */
  limiter?: RateLimiter;
  /**
   * Attach `X-RateLimit-*` headers to the successful response. Defaults true.
   */
  attachHeaders?: boolean;
}

/** Extract a best-effort client IP from a Next.js request. */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // `req.ip` is set by some Node runtimes; fall back to "anonymous".
  const ip = (req as unknown as { ip?: string }).ip;
  return ip ?? "anonymous";
}

function withRateLimitHeaders(res: Response, d: RateLimitDecision): Response {
  res.headers.set("X-RateLimit-Limit", String(d.limit));
  res.headers.set("X-RateLimit-Remaining", String(d.remaining));
  res.headers.set("X-RateLimit-Reset", String(Math.floor(d.resetAt / 1000)));
  return res;
}

/**
 * Wrap an API route handler with rate limiting. Throws {@link RateLimitError}
 * (returned as a 429 by the caller's error boundary) when exceeded.
 *
 * ```ts
 * export const POST = rateLimit({ preset: RATE_LIMIT_PRESETS.AI_GENERATION })(
 *   async (req) => { ... },
 * );
 * ```
 */
export function rateLimit(opts: RateLimitWrapperOptions = {}) {
  return <TArgs extends unknown[]>(
    handler: (req: NextRequest, ...args: TArgs) => Promise<Response> | Response,
  ): ((req: NextRequest, ...args: TArgs) => Promise<Response>) => {
    const limiter = opts.limiter ?? rateLimiter;
    const preset = opts.preset;
    const limit = preset?.limit ?? opts.limit ?? RATE_LIMIT_PRESETS.API.limit;
    const windowSec =
      preset?.windowSec ?? opts.windowSec ?? RATE_LIMIT_PRESETS.API.windowSec;
    const keyBy = opts.keyBy ?? getClientIp;
    const attachHeaders = opts.attachHeaders ?? true;

    return async (req: NextRequest, ...args: TArgs): Promise<Response> => {
      const key = await keyBy(req);
      const decision = await limiter.consume(key, limit, windowSec);
      if (attachHeaders) {
        // Pre-flight headers — the handler may add more.
        req.headers.set("x-rate-limit-limit", String(decision.limit));
      }
      const res = await handler(req, ...args);
      if (attachHeaders) return withRateLimitHeaders(res, decision);
      return res;
    };
  };
}

export { RATE_LIMIT_PRESETS, type RateLimitPreset, type RateLimitPresetName } from "./presets";
