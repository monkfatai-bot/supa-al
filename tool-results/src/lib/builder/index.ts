/**
 * Supa AI — Phase 9B Builder — full barrel (server-only).
 *
 * Re-exports the client-safe types + node catalog *plus* the
 * server-only {@link BuilderService}. Importing this barrel from a
 * Client Component will throw at build time — client code MUST import
 * from `@/lib/builder/client` instead.
 *
 * @module @/lib/builder
 */
import "server-only";

export * from "./client";
export {
  BuilderService,
  createBuilderService,
  createBuilderServiceWith,
} from "./builder-service";
