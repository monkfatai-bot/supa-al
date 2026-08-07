/**
 * Supa AI — Phase 9B Builder — client-safe barrel.
 *
 * Re-exports ONLY types and client-safe constants from the builder domain.
 * **No `server-only` modules** live behind this barrel, so Client
 * Components can import from here without triggering the
 * `'server-only' cannot be imported from a Client Component` error.
 *
 * Client components MUST import from `@/lib/builder/client`, NOT
 * `@/lib/builder`. The full barrel (`@/lib/builder`) pulls in
 * `builder-service.ts` which imports `server-only`.
 *
 * @module @/lib/builder/client
 */
export * from "./types";
export * from "./node-definitions";
