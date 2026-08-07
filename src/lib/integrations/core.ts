/**
 * Supa AI — Phase 10 Integration Hub — core helpers.
 *
 * Server-only re-exports from `@/lib/workspace/core` plus integration-specific
 * utilities used by every Phase 10 module:
 *
 *   - {@link generateWebhookSlug}  — URL-safe slug for a webhook subscription.
 *   - {@link computeRetryDelay}    — exponential backoff with jitter.
 *   - {@link isoInFuture}          — ISO timestamp `secondsFromNow` in the future.
 *   - {@link wrapIntegrationError} — map unknown errors into {@link DatabaseError}.
 *   - {@link assertIntegrationAccess} — verify the caller can read/manage
 *     the integration's workspace.
 *
 * @module @/lib/integrations/core
 */
import "server-only";

import { randomBytes } from "node:crypto";

import {
  AuthorizationError,
  DatabaseError,
  NotFoundError,
  ValidationError,
  toAppError,
} from "@/lib/errors";
import {
  ADMIN_ROLES,
  WRITE_ROLES,
  assertCanWrite,
  assertCanAdmin,
  assertMember,
  assertRole,
  findMembership,
  notFound,
  slugify,
  toDbError,
  toJson,
  validationError,
  wrapUnexpected,
} from "@/lib/workspace/core";

// Re-export everything callers need from the workspace core.
export {
  ADMIN_ROLES,
  WRITE_ROLES,
  assertCanWrite,
  assertCanAdmin,
  assertMember,
  assertRole,
  findMembership,
  notFound,
  slugify,
  toDbError,
  toJson,
  validationError,
  wrapUnexpected,
};
export { AuthorizationError, DatabaseError, NotFoundError, ValidationError };

import type { AnySupabaseClient } from "@/lib/auth/helpers";

// ---------------------------------------------------------------------------
// Webhook slug + secret generation
// ---------------------------------------------------------------------------

const WEBHOOK_SLUG_BYTES = 6;

/**
 * Generate a unique URL-safe slug for a webhook subscription. Combines
 * the (optional) connector key with random hex so two subscriptions on
 * the same connector don't collide.
 */
export function generateWebhookSlug(connectorKey?: string): string {
  const base = (connectorKey ?? "webhook")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const stub = base.length > 0 ? base : "webhook";
  return `${stub}-${randomBytes(WEBHOOK_SLUG_BYTES).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Retry backoff
// ---------------------------------------------------------------------------

const RETRY_BASE_MS = 2_000; // 2 seconds
const RETRY_MAX_MS = 60 * 60 * 1000; // 1 hour

/**
 * Compute the delay (in ms) before the next retry attempt using an
 * exponential-backoff-with-jitter formula:
 *
 *   delay = min(RETRY_MAX_MS, RETRY_BASE_MS * 2^attempt) + jitter(0..500)
 *
 * `attempt` is 0-indexed (0 = first retry).
 */
export function computeRetryDelay(attempt: number): number {
  const safe = Math.max(0, attempt);
  const exp = RETRY_BASE_MS * Math.pow(2, safe);
  const capped = Math.min(RETRY_MAX_MS, exp);
  const jitter = Math.floor(Math.random() * 500);
  return capped + jitter;
}

/**
 * Build an ISO timestamp `secondsFromNow` seconds in the future. Returns
 * `null` when `secondsFromNow` is null/undefined/non-positive so callers
 * can pass through optional expires-at values without branching.
 */
export function isoInFuture(secondsFromNow: number | null | undefined): string | null {
  if (typeof secondsFromNow !== "number" || secondsFromNow <= 0) return null;
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

/**
 * Wrap an unexpected caught value into a {@link DatabaseError}. The
 * integration-specific variant adds `integrationId` / `workspaceId`
 * to the details when available.
 */
export function wrapIntegrationError(
  err: unknown,
  message: string,
  context?: Record<string, unknown>,
): DatabaseError {
  const appErr = toAppError(err);
  if (appErr instanceof DatabaseError) {
    return appErr;
  }
  return new DatabaseError(message, {
    ...context,
    cause: appErr.message,
  });
}

/**
 * Assert that `userId` may access `integrationId`'s workspace. Looks up
 * the integration row to resolve `workspace_id`, then delegates to
 * {@link assertMember}. Returns the membership row on success.
 *
 * When `requireWrite` is true, also asserts the caller holds one of
 * {@link WRITE_ROLES}. Use {@link assertIntegrationAdmin} for admin-gated
 * operations (publishing, deleting).
 */
export async function assertIntegrationAccess(
  supabase: AnySupabaseClient,
  integrationId: string,
  userId: string,
  requireWrite = false,
): Promise<{ workspaceId: string; membership: Awaited<ReturnType<typeof assertMember>> }> {
  const { data, error } = await supabase
    .from("integrations")
    .select("workspace_id")
    .eq("id", integrationId)
    .maybeSingle();
  if (error) throw toDbError(error, "integrations.accessCheck failed");
  if (!data) throw new NotFoundError("Integration", integrationId);

  const workspaceId = data.workspace_id as string;
  const membership = requireWrite
    ? await assertRole(supabase, workspaceId, userId, WRITE_ROLES)
    : await assertMember(supabase, workspaceId, userId);

  return { workspaceId, membership };
}

/**
 * Assert that `userId` may administer the integration's workspace
 * (owner / admin). Returns the membership row on success.
 */
export async function assertIntegrationAdmin(
  supabase: AnySupabaseClient,
  integrationId: string,
  userId: string,
): Promise<{ workspaceId: string; membership: Awaited<ReturnType<typeof assertRole>> }> {
  const { data, error } = await supabase
    .from("integrations")
    .select("workspace_id")
    .eq("id", integrationId)
    .maybeSingle();
  if (error) throw toDbError(error, "integrations.adminCheck failed");
  if (!data) throw new NotFoundError("Integration", integrationId);

  const workspaceId = data.workspace_id as string;
  const membership = await assertRole(supabase, workspaceId, userId, ADMIN_ROLES);
  return { workspaceId, membership };
}
