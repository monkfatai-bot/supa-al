/**
 * Supa AI — Phase 9C Employees — client-safe barrel.
 *
 * Re-exports ONLY types and client-safe constants from the employees
 * domain. **No `server-only` modules** live behind this barrel, so
 * Client Components can import from here without triggering the
 * `'server-only' cannot be imported from a Client Component` error
 * that occurred in Phase 9B.
 *
 * Client components MUST import from `@/lib/employees/client`, NOT
 * `@/lib/employees`. The full barrel (`@/lib/employees`) pulls in
 * `employee-service.ts` which imports `server-only`.
 *
 * @module @/lib/employees/client
 */
export * from "./types";
export * from "./skill-registry";
