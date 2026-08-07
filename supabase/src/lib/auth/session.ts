/**
 * Supa AI — Server-side session helpers.
 *
 * Thin, typed wrappers around the Supabase server client that turn the
 * auth-js response shapes into either a usable user/session pair or a thrown
 * {@link AuthenticationError}. Every public API route / RSC that needs an
 * authenticated caller should go through this module rather than touching the
 * Supabase client directly, so error mapping and audit logging stay
 * consistent.
 *
 * @module @/lib/auth/session
 */
import "server-only";

import type { Session, User } from "@supabase/supabase-js";

import { AuthenticationError, DatabaseError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient, type ServerSupabaseClient } from "@/lib/supabase/server";

/** Canonical authenticated-user type — a re-exported Supabase `User`. */
export type AuthUser = User;

/** Canonical session type — a re-exported Supabase `Session`. */
export type AuthSession = Session;

/** Result of {@link getSession}. */
export interface SessionContext {
  user: AuthUser;
  session: AuthSession;
}

/**
 * Resolve the current user's session from the request cookies.
 *
 * @returns The `{user, session}` pair, or `null` if the caller is not
 *   authenticated. Network/transport errors are mapped to a thrown
 *   {@link DatabaseError}; a missing session is **not** an error and returns
 *   `null`.
 */
export async function getSession(): Promise<SessionContext | null> {
  let supabase: ServerSupabaseClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    throw new DatabaseError("Failed to construct Supabase server client.", {
      cause: (err as Error)?.message,
    });
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      // `getUser` returns an error when there is no session
      // (`AuthSessionMissingError`) — that is the same as "no user", so we
      // return null rather than surfacing it as an error.
      if (userError.name === "AuthSessionMissingError") {
        return null;
      }
      logger.warn("supabase.auth.getUser failed", {
        errorName: userError.name,
        errorMessage: userError.message,
      });
      return null;
    }

    if (!user) {
      return null;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      logger.warn("supabase.auth.getSession failed", {
        errorName: sessionError.name,
        errorMessage: sessionError.message,
      });
      return null;
    }

    if (!session) {
      return null;
    }

    return { user, session };
  } catch (err) {
    throw new DatabaseError("Unexpected failure while resolving auth session.", {
      cause: (err as Error)?.message,
    });
  }
}

/**
 * Return the authenticated user, or throw {@link AuthenticationError} if the
 * caller is not authenticated.
 *
 * Prefer {@link requireUserId} when only the id is needed — it reads more
 * clearly at call sites and avoids tempting downstream code from reading
 * user fields the caller doesn't need.
 */
export async function getCurrentUser(): Promise<AuthUser> {
  const ctx = await getSession();
  if (!ctx) {
    throw new AuthenticationError("Sign in to continue.");
  }
  return ctx.user;
}

/**
 * Return the authenticated user's id, or throw {@link AuthenticationError}.
 *
 * This is the canonical "are you logged in?" gate for protected routes:
 *
 * ```ts
 * const userId = await requireUserId();
 * ```
 */
export async function requireUserId(): Promise<string> {
  const ctx = await getSession();
  if (!ctx) {
    throw new AuthenticationError("Sign in to continue.");
  }
  return ctx.user.id;
}
