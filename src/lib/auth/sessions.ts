/**
 * Supa AI — User session service (Phase 2).
 *
 * Owns the `user_sessions` table — multi-device session tracking with UA,
 * IP, device type, OS, browser, coarse location, and revocation state.
 * The service complements (but does not replace) Supabase Auth's own JWT
 * session model: every Supabase access-token issuance is mirrored into
 * `user_sessions` via {@link recordSession} so the dashboard can render a
 * "Devices" list and the user can revoke other sessions.
 *
 * Token handling: the session token itself is NEVER persisted. We store
 * only `hash(token)` via `@/lib/security/crypto` so a DB leak cannot be
 * replayed as a session-hijack.
 *
 * @module @/lib/auth/sessions
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hash } from "@/lib/security/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Tables,
  TablesInsert,
} from "@/lib/supabase/types";
import { parseUserAgent, type AnySupabaseClient } from "@/lib/auth/helpers";

/** Row shape for the `user_sessions` table. */
export type UserSession = Tables<"user_sessions">;

/** Input for {@link SessionService.recordSession}. */
export interface RecordSessionInput {
  /** Raw Supabase access token. Hashed before persisting — never stored. */
  sessionToken?: string | null;
  /** Caller's User-Agent header. */
  userAgent?: string | null;
  /** Caller's IP address. */
  ipAddress?: string | null;
  /** Coarse geo label (city, country) if available. */
  location?: string | null;
  /** Mark this session as the current one (sets `is_current = true`). */
  isCurrent?: boolean;
  /** Session expiry (ISO timestamp). */
  expiresAt?: string | null;
}

/**
 * Service object encapsulating all `user_sessions` operations. Constructed
 * with a typed Supabase client (server or admin).
 */
export class SessionService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * List the caller's active sessions (revoked_at IS NULL), newest
   * `last_active_at` first. Expired sessions are excluded.
   */
  async listSessions(userId: string): Promise<UserSession[]> {
    try {
      const { data, error } = await this.supabase
        .from("user_sessions")
        .select()
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("last_active_at", { ascending: false });

      if (error) throw this.toDbError(error, "listSessions failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing sessions.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Revoke a single session. Sets `revoked_at = now()`. Idempotent —
   * returns silently if the session is already revoked.
   *
   * @throws {NotFoundError} if no session matches `(userId, sessionId)`.
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), is_current: false })
        .eq("id", sessionId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (error) throw this.toDbError(error, "revokeSession failed");
      if (!data) {
        throw new NotFoundError("Session", sessionId, { userId });
      }
      logger.info("session revoked", { userId, sessionId });
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure revoking session.",
        { userId, sessionId, cause: appErr.message },
      );
    }
  }

  /**
   * Revoke every active session for the caller except the one identified by
   * `exceptSessionId` (typically the current session). If `exceptSessionId`
   * is omitted, every session is revoked.
   *
   * Returns silently if the caller has no active sessions.
   */
  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<void> {
    try {
      let query = this.supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), is_current: false })
        .eq("user_id", userId)
        .is("revoked_at", null);

      if (exceptSessionId) {
        query = query.neq("id", exceptSessionId);
      }

      const { error } = await query;
      if (error) throw this.toDbError(error, "revokeAllSessions failed");
      logger.info("bulk session revocation", {
        userId,
        exceptSessionId: exceptSessionId ?? null,
      });
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure revoking sessions.",
        { userId, cause: appErr.message },
      );
    }
  }

  /**
   * Record a new session row. Called after Supabase Auth issues a fresh
   * access token (login / token refresh). The raw token is hashed via
   * `@/lib/security/crypto` `hash()` — the plaintext is NEVER persisted.
   *
   * The User-Agent is parsed into `device_type`, `os`, `browser` via
   * {@link parseUserAgent} (no external dependency).
   *
   * @returns The inserted row (including its server-assigned id).
   */
  async recordSession(
    userId: string,
    input: RecordSessionInput,
  ): Promise<UserSession> {
    const parsed = parseUserAgent(input.userAgent ?? null);

    const insert: TablesInsert<"user_sessions"> = {
      user_id: userId,
      session_token_hash: input.sessionToken
        ? hash(input.sessionToken)
        : null,
      user_agent: input.userAgent ?? null,
      ip_address: input.ipAddress ?? null,
      device_type: parsed.deviceType,
      os: parsed.os,
      browser: parsed.browser,
      location: input.location ?? null,
      is_current: input.isCurrent ?? false,
      expires_at: input.expiresAt ?? null,
    };

    try {
      const { data, error } = await this.supabase
        .from("user_sessions")
        .insert(insert)
        .select()
        .single();

      if (error) throw this.toDbError(error, "recordSession failed");
      if (!data) {
        throw new DatabaseError("recordSession returned no row.", { userId });
      }
      logger.info("session recorded", {
        userId,
        sessionId: data.id,
        deviceType: data.device_type,
        os: data.os,
        browser: data.browser,
      });
      return data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure recording session.",
        { userId, cause: appErr.message },
      );
    }
  }

  /**
   * Update `last_active_at = now()` for a session. Called on each
   * authenticated request to keep the "Devices" list fresh.
   *
   * Silently returns if the session does not exist (best-effort).
   */
  async touchSession(sessionId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("user_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", sessionId);

      if (error) throw this.toDbError(error, "touchSession failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure touching session.",
        { sessionId, cause: appErr.message },
      );
    }
  }

  /** Map a Postgrest error into a {@link DatabaseError}. */
  private toDbError(
    error: { code?: string; message?: string; name?: string; details?: unknown },
    message: string,
  ): DatabaseError {
    return new DatabaseError(message, {
      errorCode: error.code,
      errorName: error.name,
      errorMessage: error.message,
      errorDetails: error.details,
    });
  }
}

/**
 * Build the canonical RLS-enforced `SessionService` for use in
 * Server Components + Route Handlers. Only the caller's sessions are
 * reachable.
 */
export async function createSessionService(): Promise<SessionService> {
  const supabase = await createSupabaseServerClient();
  return new SessionService(supabase);
}

/**
 * Build an admin `SessionService` that bypasses RLS. Use only for system
 * operations (e.g. bulk-revoking sessions during account deletion).
 */
export function createSessionServiceAdmin(): SessionService {
  const supabase = createSupabaseAdminClient();
  return new SessionService(supabase);
}
