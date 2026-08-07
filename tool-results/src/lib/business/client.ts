/**
 * Supa AI — Phase 10 Business AI Suite — client-safe barrel.
 *
 * Re-exports ONLY types from the business domain. **No `server-only`
 * modules** live behind this barrel, so Client Components can import
 * from here without triggering the `'server-only' cannot be imported
 * from a Client Component` error.
 *
 * Client components MUST import from `@/lib/business/client`, NOT
 * `@/lib/business`. The full barrel (`@/lib/business`) pulls in the
 * service modules that import `server-only`.
 *
 * @module @/lib/business/client
 */
export * from "./types";
