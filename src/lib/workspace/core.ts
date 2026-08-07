/**
 * Supa AI — Phase 9 Workspace & Collaboration — core helpers (CRITICAL).
 *
 * Server-only shared utilities used by every workspace service:
 *   - {@link assertMember}     — verify the caller is a workspace member.
 *   - {@link assertRole}       — verify the caller holds one of the
 *                                 permitted roles (owner/admin/editor/...).
 *   - {@link slugify}          — URL-safe slug generator.
 *   - {@link toJson}           — coerce arbitrary values into a Json value.
 *   - {@link toDbError}        — map a Postgrest error into a DatabaseError.
 *   - {@link wrapUnexpected}   — catch-all wrapper for try/catch blocks.
 *   - {@link WRITE_ROLES}      — roles permitted to mutate workspace content.
 *   - {@link ADMIN_ROLES}      — roles permitted to manage the workspace.
 *
 * CRITICAL: This file is imported by Phase 10 (`@/lib/integrations/core`)
 * via a thin re-export through `@/lib/workspace`. Do not move, rename, or
 * remove exports without coordinating with Phase 10. The barrel
 * `@/lib/workspace` re-exports every symbol below.
 *
 * @module @/lib/workspace/core
 */
import "server-only";

import {
  AuthorizationError,
  DatabaseError,
  NotFoundError,
  toAppError,
  ValidationError,
} from "@/lib/errors";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import type { Json, WorkspaceMember, WorkspaceRole } from "./types";

// ---------------------------------------------------------------------------
// Role sets
// ---------------------------------------------------------------------------

/**
 * Roles permitted to create / modify / delete workspace content
 * (documents, folders, comments, knowledge, files). Viewers cannot write.
 */
export const WRITE_ROLES: readonly WorkspaceRole[] = [
  "owner",
  "admin",
  "editor",
  "member",
] as const;

/**
 * Roles permitted to manage the workspace itself (members, settings,
 * billing, roles). Editors + members are excluded.
 */
export const ADMIN_ROLES: readonly WorkspaceRole[] = [
  "owner",
  "admin",
] as const;

// ---------------------------------------------------------------------------
// Membership + role enforcement
// ---------------------------------------------------------------------------

/**
 * Look up the caller's membership row for a workspace. Returns `null` when
 * the caller is not a member (or the membership is not active).
 *
 * Uses the {@link AnySupabaseClient} that the calling service was constructed
 * with — so the RLS policies on `workspace_members` decide whether the row
 * is visible (the server client respects RLS; the admin client bypasses it).
 */
export async function findMembership(
  supabase: AnySupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMember | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw toDbError(error, "workspace.findMembership failed");
  return data ?? null;
}

/**
 * Assert that `userId` is an active member of `workspaceId`. Throws
 * {@link AuthorizationError} when not. Returns the membership row on
 * success so callers can inspect the role without a second round-trip.
 */
export async function assertMember(
  supabase: AnySupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMember> {
  const membership = await findMembership(supabase, workspaceId, userId);
  if (!membership) {
    throw new AuthorizationError("You are not a member of this workspace.", {
      workspaceId,
      userId,
    });
  }
  return membership;
}

/**
 * Assert that `userId` is an active member of `workspaceId` AND holds one
 * of `roles`. Throws {@link AuthorizationError} on failure. Returns the
 * membership row on success.
 */
export async function assertRole(
  supabase: AnySupabaseClient,
  workspaceId: string,
  userId: string,
  roles: readonly WorkspaceRole[],
): Promise<WorkspaceMember> {
  const membership = await assertMember(supabase, workspaceId, userId);
  if (!roles.includes(membership.role)) {
    throw new AuthorizationError(
      "Your workspace role does not permit this action.",
      { workspaceId, userId, role: membership.role, requiredRoles: roles },
    );
  }
  return membership;
}

/**
 * Convenience: assert that `userId` may write workspace content
 * (owner / admin / editor / member).
 */
export async function assertCanWrite(
  supabase: AnySupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMember> {
  return assertRole(supabase, workspaceId, userId, WRITE_ROLES);
}

/**
 * Convenience: assert that `userId` may manage the workspace
 * (owner / admin).
 */
export async function assertCanAdmin(
  supabase: AnySupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMember> {
  return assertRole(supabase, workspaceId, userId, ADMIN_ROLES);
}

// ---------------------------------------------------------------------------
// Slug + Json helpers
// ---------------------------------------------------------------------------

/**
 * Generate a URL-safe slug from a free-form name. Lowercases, replaces
 * whitespace + non-alphanumeric runs with a single hyphen, trims leading
 * + trailing hyphens, and falls back to a `workspace-<random>` stub
 * when the result is empty.
 */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug) return slug;
  return `workspace-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Coerce an arbitrary value into a Postgres-safe `Json` payload.
 *   - Primitives pass through.
 *   - `undefined` → `null` (Postgres has no `undefined`).
 *   - Arrays / plain objects pass through (their content is the caller's
 *     responsibility — the `Json` type is structural, not validated).
 */
export function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value as unknown as Json;
  return value as Json;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/** Shape of a Postgrest error (subset — the SDK exposes more, but we only need these). */
export interface PostgrestErrorLike {
  code?: string;
  message?: string;
  name?: string;
  details?: unknown;
  hint?: string;
}

/**
 * Map a Postgrest-shaped error into a {@link DatabaseError}. Centralized
 * so the call sites stay narrow and the field names never drift.
 */
export function toDbError(
  error: PostgrestErrorLike,
  message: string,
): DatabaseError {
  return new DatabaseError(message, {
    errorCode: error.code,
    errorName: error.name,
    errorMessage: error.message,
    errorDetails: error.details,
  });
}

/**
 * Wrap an unexpected caught value into a {@link DatabaseError}. Use this
 * as the catch-all branch in service methods after re-throwing known
 * error types (DatabaseError, NotFoundError, ValidationError, etc.).
 */
export function wrapUnexpected(
  err: unknown,
  message: string,
  context?: Record<string, unknown>,
): DatabaseError {
  const appErr = toAppError(err);
  return new DatabaseError(message, {
    ...context,
    cause: appErr.message,
  });
}

/**
 * Build a {@link NotFoundError} for a workspace-scoped resource. Centralized
 * so the resource name + id formatting stays consistent across services.
 */
export function notFound(
  resource: string,
  id?: string | number,
): NotFoundError {
  return new NotFoundError(resource, id);
}

/**
 * Build a {@link ValidationError} for a workspace-scoped field. Centralized
 * so the error message + details shape stays consistent.
 */
export function validationError(
  message: string,
  fields?: Record<string, unknown>,
): ValidationError {
  return new ValidationError(message, fields ? { fields } : undefined);
}

/** Re-export the error classes for callers that want them in one import. */
export {
  AuthorizationError,
  DatabaseError,
  NotFoundError,
  ValidationError,
};
