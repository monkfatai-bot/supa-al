/**
 * Provider Registry — Singleton
 *
 * Central registry for all provider adapters.
 * Use getInstance() to access the single registry instance.
 */

import type { ProviderAdapter, ProviderRegistry } from "./types";

class ProviderRegistryImpl implements ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(providerId: string): ProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getAll(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getByCategory(category: string): ProviderAdapter[] {
    return this.getAll().filter((a) => a.category === category);
  }
}

let instance: ProviderRegistryImpl | null = null;

/**
 * Get the singleton ProviderRegistry instance.
 * Adapters are registered by the barrel export in adapters/index.ts.
 */
export function getInstance(): ProviderRegistryImpl {
  if (!instance) {
    instance = new ProviderRegistryImpl();
  }
  return instance;
}
