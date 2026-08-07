/**
 * Supa AI — constants barrel.
 *
 * Single import surface for platform-wide constants. Feature modules
 * should import from `@/lib/constants` rather than reaching into
 * individual files so internal layout can evolve without breaking call
 * sites.
 *
 * @module @/lib/constants
 */

export * from "./app";
export * from "./ai";
export * from "./billing";
export * from "./security";
export * from "./regions";
