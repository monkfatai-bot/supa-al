/**
 * Supa AI — Phase 10 Integration Hub — client-safe barrel.
 *
 * Re-exports ONLY the types + constants that are safe to import from
 * client components. Server-only modules (services, vault, manager,
 * engine, etc.) are NOT re-exported here — import them via
 * `@/lib/integrations` instead.
 *
 * @module @/lib/integrations/client
 */
export * from "./types";
