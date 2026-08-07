/**
 * Supa AI — Activity log service (Phase 2).
 *
 * Owns the `activity_logs` audit trail. Writes go through the **admin**
 * Supabase client so audit events can be recorded even when RLS would
 * otherwise block them (e.g. during signup, before the user has an
 * authenticated session, or after an account has been soft-deleted).
 *
 * Every audit entry is sanitized through {@link sanitizeMetadata} before it
 * hits the DB — secrets, tokens, and credentials are stripped by key name,
 * so a stray `password` field in an `opts.metadata` payload never lands in
 * the audit trail.
 *
 * @module @/lib/auth/activity
 */
import "server-only";

import {
  DatabaseError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Tables,
  TablesInsert,
} from "@/lib/supabase/types";
import {
  sanitizeMetadata,
  type AnySupabaseClient,
} from "@/lib/auth/helpers";

/** Row shape for the `activity_logs` table. */
export type ActivityLog = Tables<"activity_logs">;

/**
 * Canonical activity-event types. Matches the set enumerated in
 * `supabase/migrations/0004_phase2_auth.sql`.
 */
export type ActivityEventType =
  | "signup"
  | "login"
  | "logout"
  | "password_reset"
  | "email_change"
  | "profile_update"
  | "failed_login"
  | "account_deleted"
  | "oauth_link"
  | "session_revoked"
  | "password_change"
  | "email_verified";

/** Severity levels (mirrors the SQL check constraint). */
export type ActivitySeverity = Tables<"activity_logs">["severity"];

/** Options accepted by {@link ActivityLogService.log}. */
export interface LogOptions {
  /** Event-specific context. Sanitized through {@link sanitizeMetadata}. */
  metadata?: unknown;
  /** Severity. Defaults to `"info"`. */
  severity?: ActivitySeverity;
  /** Caller IP, if known. */
  ipAddress?: string | null;
  /** Caller User-Agent, if known. */
  userAgent?: string | null;
}

/**
 * Service object encapsulating all `activity_logs` operations. Always
 * constructed with the **admin** Supabase client so it can write audit
 * events outside an authenticated user context (signup, failed login,
 * post-deletion, etc.).
 */
export class ActivityLogService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Record an audit event. Returns `void` — audit logging is best-effort
   * and never blocks the caller. Errors are caught, logged, and swallowed
   * (a failed audit write must not break a signup or login flow).
   *
   * The `metadata` payload is sanitized through {@link sanitizeMetadata}
   * before insert, so any key matching `/token|secret|password|key|auth/i`
   * is stripped automatically.
   */
  async log(
    userId: string | null,
    eventType: ActivityEventType | string,
    opts: LogOptions = {},
  ): Promise<void> {
    const insert: TablesInsert<"activity_logs"> = {
      user_id: userId,
      event_type: eventType,
      severity: opts.severity ?? "info",
      ip_address: opts.ipAddress ?? null,
      user_agent: opts.userAgent ?? null,
      metadata: sanitizeMetadata(opts.metadata) as TablesInsert<"activity_logs">["metadata"],
    };

    try {
      const { error } = await this.supabase
        .from("activity_logs")
        .insert(insert);

      if (error) {
        logger.warn("activity_logs insert failed", {
          userId,
          eventType,
          errorCode: error.code,
          errorMessage: error.message,
        });
        return;
      }
    } catch (err) {
      // Audit logging is best-effort — never propagate.
      const appErr = toAppError(err);
      logger.warn("activity_logs insert threw", {
        userId,
        eventType,
        cause: appErr.message,
      });
    }
  }

  /**
   * List the caller's audit events (newest first). Optionally filter by
   * event type and limit the result count.
   */
  async list(
    userId: string,
    opts: { limit?: number; eventTypes?: readonly string[] } = {},
  ): Promise<ActivityLog[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));

    try {
      let query = this.supabase
        .from("activity_logs")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (opts.eventTypes && opts.eventTypes.length > 0) {
        query = query.in("event_type", opts.eventTypes);
      }

      const { data, error } = await query;
      if (error) throw this.toDbError(error, "activity_logs list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing activity_logs.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Convenience for dashboards: return the most recent `limit` audit events
   * for the caller. Defaults to 10.
   */
  async listRecent(userId: string, limit = 10): Promise<ActivityLog[]> {
    return this.list(userId, { limit });
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
 * Build the canonical {@link ActivityLogService}. Always uses the admin
 * Supabase client — audit writes must succeed outside an authenticated
 * user context (signup, failed login, post-deletion, etc.).
 */
export function createActivityLogService(): ActivityLogService {
  const supabase = createSupabaseAdminClient();
  return new ActivityLogService(supabase);
}
