/**
 * Supa AI — shared type barrel.
 *
 * Single import surface for all cross-cutting types. Feature modules should
 * import from `@/types` rather than reaching into individual files so we
 * can reorganize internals without breaking call sites.
 *
 * @module @/types
 */

export * from "./common";
export * from "./api";
export * from "./auth";
