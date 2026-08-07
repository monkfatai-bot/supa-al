/**
 * Supa AI — Feature flag service.
 *
 * Two-tier evaluation: runtime overrides (set by admins via the dashboard or
 * ops scripts) take priority over the static defaults in `env.features.*`.
 *
 * Override storage uses the {@link KVStore} abstraction so it works in
 * development (memory) and production (Redis) with no code change. In Phase 2
 * the override layer can be backed by Supabase without touching call sites.
 *
 * Server-only.
 *
 * @module @/lib/feature-flags
 */
import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import type { KVStore } from "@/lib/redis";
import { getStore } from "@/lib/redis";

/** Canonical flag identifiers. Use these constants — never raw strings. */
export const FEATURE_FLAGS = {
  CHAT: "chat",
  IMAGE_GENERATION: "image_generation",
  MARKETPLACE: "marketplace",
  BUSINESS_TOOLS: "business_tools",
  BILLING: "billing",
  NEW_ONBOARDING: "new_onboarding",
} as const;

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/** All known flags — used by `listFlags()` and admin UIs. */
export const FEATURE_FLAG_LIST: readonly FeatureFlagName[] = Object.values(
  FEATURE_FLAGS,
);

export interface FeatureFlagStatus {
  name: FeatureFlagName;
  enabled: boolean;
  /** Where the value came from: `override` or `default`. */
  source: "override" | "default";
}

/** Context for future segment-based evaluation (e.g. beta cohort). */
export interface FeatureFlagContext {
  userId?: string;
  orgId?: string;
  email?: string;
  // Reserved for Phase 2: plan tier, role, percentage rollout.
}

export interface FeatureFlagServiceOptions {
  store?: KVStore;
  /** Override key prefix in the KV store. */
  prefix?: string;
}

const OVERRIDE_PREFIX = "ff:override:";

export class FeatureFlagService {
  private readonly store: KVStore;
  private readonly prefix: string;

  constructor(opts: FeatureFlagServiceOptions = {}) {
    this.store = opts.store ?? getStore();
    this.prefix = opts.prefix ?? OVERRIDE_PREFIX;
  }

  /**
   * Synchronous-ish evaluation: looks up an override first; falls back to the
   * env default. The async I/O happens via an internal cache that is warmed on
   * first call per process — but to keep the API simple in Phase 1 we expose
   * this as `Promise<boolean>`. Callers that need a pure sync check (rare)
   * should use {@link isEnabledSync} which only sees env defaults.
   */
  async isEnabledAsync(
    flag: FeatureFlagName,
    _context?: FeatureFlagContext,
  ): Promise<boolean> {
    const override = await this.readOverride(flag);
    if (override !== null) return override;
    return this.envDefault(flag);
  }

  /**
   * Sync variant: only consults env defaults. Use this only when you cannot
   * await (e.g. inside a render function). When runtime overrides matter,
   * always prefer {@link isEnabledAsync}.
   */
  isEnabledSync(flag: FeatureFlagName): boolean {
    return this.envDefault(flag);
  }

  /** Convenience alias mirroring `isEnabledAsync`. */
  async isEnabled(
    flag: FeatureFlagName,
    context?: FeatureFlagContext,
  ): Promise<boolean> {
    return this.isEnabledAsync(flag, context);
  }

  /**
   * Admin: set a runtime override (sticky until cleared). Persists to the
   * KV store with no TTL — admin actions should be intentional.
   */
  async setOverride(flag: FeatureFlagName, enabled: boolean): Promise<void> {
    const key = `${this.prefix}${flag}`;
    await this.store.set(key, enabled);
    logger.info("Feature flag override set", { flag, enabled });
  }

  /** Admin: clear an override, reverting to the env default. */
  async clearOverride(flag: FeatureFlagName): Promise<void> {
    const key = `${this.prefix}${flag}`;
    await this.store.del(key);
    logger.info("Feature flag override cleared", { flag });
  }

  /**
   * Returns the current state of every known flag (override or default).
   */
  async listFlags(): Promise<FeatureFlagStatus[]> {
    const out: FeatureFlagStatus[] = [];
    for (const flag of FEATURE_FLAG_LIST) {
      const override = await this.readOverride(flag);
      if (override !== null) {
        out.push({ name: flag, enabled: override, source: "override" });
      } else {
        out.push({ name: flag, enabled: this.envDefault(flag), source: "default" });
      }
    }
    return out;
  }

  // --- internals ---------------------------------------------------------

  private async readOverride(flag: FeatureFlagName): Promise<boolean | null> {
    try {
      const v = await this.store.get(`${this.prefix}${flag}`);
      if (v === null) return null;
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v === "true";
      if (typeof v === "number") return v !== 0;
      return null;
    } catch (err) {
      // Don't let a KV hiccup block flag evaluation — fall through to default.
      logger.error("Feature flag override read failed; using default.", {
        flag,
        error: String(err),
      });
      return null;
    }
  }

  private envDefault(flag: FeatureFlagName): boolean {
    switch (flag) {
      case FEATURE_FLAGS.CHAT:
        return env.features.chat;
      case FEATURE_FLAGS.IMAGE_GENERATION:
        return env.features.imageGeneration;
      case FEATURE_FLAGS.MARKETPLACE:
        return env.features.marketplace;
      case FEATURE_FLAGS.BUSINESS_TOOLS:
        return env.features.businessTools;
      case FEATURE_FLAGS.BILLING:
        // Billing is always enabled in Phase 1 — gated by plan, not flag.
        return true;
      case FEATURE_FLAGS.NEW_ONBOARDING:
        // Off by default; rollout via override.
        return env.app.environment === "development";
      default: {
        // Exhaustiveness check.
        const _exhaustive: never = flag;
        void _exhaustive;
        return false;
      }
    }
  }
}

/** Shared singleton. */
export const flagService = new FeatureFlagService();
