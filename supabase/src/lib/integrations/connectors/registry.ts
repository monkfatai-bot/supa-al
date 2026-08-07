/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Supa AI — Phase 10 Integration Hub — Connector Registry.
 *
 * Maps a connector key to a factory, lazy-instantiates the connector on
 * first use, and caches the instance per process. `get()` throws when
 * the connector is unknown so missing registrations surface as an
 * actionable error rather than a silent miss.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/registry
 */
import "server-only";

import type {
  ConnectorDefinition,
  MarketplaceAppCategory,
} from "../types";
import type { BaseConnector } from "./base";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** A registered connector. */
interface Registration {
  key: string;
  factory: () => BaseConnector;
  isConfigured: () => boolean;
  definition: ConnectorDefinition;
}

const REGISTRY = new Map<string, Registration>();

/**
 * Connector registry. Lazy-init + cache per process. Self-registration
 * happens at module-load time via {@link ensureRegistered}.
 */
export class ConnectorRegistry {
  private readonly instances = new Map<string, BaseConnector>();
  private registered = false;

  /**
   * Register a connector. Idempotent — re-registering the same key
   * replaces the previous registration.
   */
  register(input: {
    key: string;
    factory: () => BaseConnector;
    isConfigured: () => boolean;
    definition: ConnectorDefinition;
  }): void {
    REGISTRY.set(input.key, {
      key: input.key,
      factory: input.factory,
      isConfigured: input.isConfigured,
      definition: input.definition,
    });
    // Invalidate any cached instance of the previous registration.
    this.instances.delete(input.key);
  }

  /**
   * Get a connector instance (lazy-init, cached). Throws when the
   * connector is unknown.
   */
  get(key: string): BaseConnector {
    const reg = REGISTRY.get(key);
    if (!reg) {
      throw new Error(`Unknown connector: "${key}".`);
    }
    let instance = this.instances.get(key);
    if (!instance) {
      instance = reg.factory();
      this.instances.set(key, instance);
    }
    return instance;
  }

  /**
   * Get a connector instance or throw a friendly error when the
   * connector is unknown.
   */
  require(key: string): BaseConnector {
    return this.get(key);
  }

  /** True when `key` is a registered connector. */
  has(key: string): boolean {
    return REGISTRY.has(key);
  }

  /** All registered connector definitions (sorted by name). */
  list(): ConnectorDefinition[] {
    return [...REGISTRY.values()].map((r) => ({
      ...r.definition,
      configured: r.isConfigured(),
    }));
  }

  /** Definitions filtered by category. */
  listByCategory(category: MarketplaceAppCategory): ConnectorDefinition[] {
    return this.list().filter((d) => d.category === category);
  }

  /** Only connectors whose env vars are configured. */
  listConfigured(): ConnectorDefinition[] {
    return [...REGISTRY.values()]
      .filter((r) => r.isConfigured())
      .map((r) => ({ ...r.definition, configured: true }));
  }

  /** Create a fresh (uncached) instance for stateless one-shot use. */
  createClient(key: string): BaseConnector {
    const reg = REGISTRY.get(key);
    if (!reg) throw new Error(`Unknown connector: "${key}".`);
    return reg.factory();
  }

  /** True when the connector's env vars are set. */
  isConfigured(key: string): boolean {
    const reg = REGISTRY.get(key);
    return reg ? reg.isConfigured() : false;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const connectorRegistry = new ConnectorRegistry();

// ---------------------------------------------------------------------------
// Self-registration entry point
// ---------------------------------------------------------------------------

/**
 * Ensure every connector module has been imported so its side-effect
 * registration runs. Safe to call multiple times — subsequent calls
 * short-circuit.
 *
 * The actual import list lives below so adding a new connector only
 * requires a one-line addition here.
 */
let _registered = false;
export function ensureRegistered(): void {
  if (_registered) return;
  _registered = true;

  // AI providers (7)
  require("./openai-integration");
  require("./anthropic-integration");
  require("./gemini-integration");
  require("./openrouter-integration");
  require("./deepseek-integration");
  require("./qwen-integration");
  require("./grok-integration");

  // Communication (6)
  require("./slack");
  require("./whatsapp");
  require("./telegram");
  require("./discord");
  require("./microsoft-teams");
  require("./zoom");

  // Email (2)
  require("./gmail");
  require("./outlook");

  // Storage (3)
  require("./google-drive");
  require("./dropbox");
  require("./onedrive");

  // Development (1)
  require("./github");

  // Payments (3)
  require("./stripe");
  require("./paystack");
  require("./flutterwave");

  // Commerce (2)
  require("./shopify");
  require("./woocommerce");

  // Automation (2)
  require("./zapier");
  require("./make");

  // Productivity (2)
  require("./google-oauth");
  require("./google-calendar");
}
