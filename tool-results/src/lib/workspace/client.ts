/**
 * Supa AI — Phase 9 Workspace — client-safe barrel.
 *
 * Re-exports ONLY types and client-safe constants from the workspace
 * domain. **No `server-only` modules** live behind this barrel, so
 * Client Components can import from here without triggering the
 * `'server-only' cannot be imported from a Client Component` error.
 *
 * Client components MUST import from `@/lib/workspace/client`, NOT
 * `@/lib/workspace`. The full barrel (`@/lib/workspace`) pulls in
 * service modules that import `server-only`.
 *
 * @module @/lib/workspace/client
 */
export * from "./types";

// Re-declared here (rather than re-exported from `./core`, which is
// server-only) so the client bundle stays server-only-free. These MUST
// stay in sync with `core.ts`.
import type { WorkspaceRole } from "./types";

/** Roles permitted to write workspace content (mirror of `core.WRITE_ROLES`). */
export const WRITE_ROLES: readonly WorkspaceRole[] = [
  "owner",
  "admin",
  "editor",
  "member",
] as const;

/** Roles permitted to manage the workspace (mirror of `core.ADMIN_ROLES`). */
export const ADMIN_ROLES: readonly WorkspaceRole[] = [
  "owner",
  "admin",
] as const;

