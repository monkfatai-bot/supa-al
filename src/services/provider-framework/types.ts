/**
 * Provider Framework Types
 *
 * Defines the interfaces for the universal provider adapter system.
 * Every provider adapter (AI, communication, storage, payment, dev)
 * must implement the ProviderAdapter interface.
 */

// ─── Core Interfaces ─────────────────────────────────────────

export interface ProviderAdapter {
  /** Unique identifier e.g. 'openai', 'stripe', 'gmail' */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Category grouping e.g. 'ai', 'communication', 'storage', 'payment', 'dev' */
  readonly category: string;
  /** Capabilities this provider supports e.g. ['chat', 'completion', 'image'] */
  readonly capabilities: string[];

  /** Verify credentials are valid */
  authenticate(config: ProviderConfig): Promise<void>;
  /** Execute an action through the provider */
  call(action: string, params: Record<string, unknown>): Promise<ProviderResult>;
  /** Check if the provider is reachable and healthy */
  healthCheck(): Promise<ProviderHealthResult>;
  /** List supported capabilities */
  getCapabilities(): string[];
  /** Clean up resources */
  destroy(): void;
}

export interface ProviderConfig {
  workspaceId: string;
  accountId: string;
  credentials: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ProviderResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealthResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  lastChecked?: string;
}

export interface ProviderRegistry {
  register(adapter: ProviderAdapter): void;
  get(providerId: string): ProviderAdapter | undefined;
  getAll(): ProviderAdapter[];
  getByCategory(category: string): ProviderAdapter[];
}

// ─── Convenience Type Aliases ─────────────────────────────────

export type ProviderCategory = "ai" | "communication" | "storage" | "payment" | "dev";

export interface ProviderInfo {
  id: string;
  name: string;
  category: string;
  capabilities: string[];
}
