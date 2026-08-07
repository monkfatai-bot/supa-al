/**
 * Supa AI — Notification service (Phase 2).
 *
 * Owns the `notifications` table — user-facing in-app notifications
 * (welcome banner, security alerts, billing receipts, product updates,
 * social mentions). The service is the single write-path through which
 * the rest of the backend pushes notifications; the UI reads via
 * {@link list} + {@link getUnreadCount}.
 *
 * RLS: every policy on `notifications` is owner-scoped
 * (`user_id = auth.uid()`), so the canonical {@link createNotificationService}
 * factory wires the server client. The `create` method is intended for
 * server-side system callers (signup completion, billing webhooks, etc.) —
 * those callers should construct the service with the admin client if they
 * need to push notifications on behalf of a user they are not authenticated
 * as.
 *
 * @module @/lib/auth/notifications
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Tables,
  TablesInsert,
} from "@/lib/supabase/types";

import type { AnySupabaseClient } from "@/lib/auth/helpers";

/** Row shape for the `notifications` table. */
export type Notification = Tables<"notifications">;

/** Canonical notification types. Mirrors the SQL comment on the table. */
export type NotificationType =
  | "welcome"
  | "security"
  | "billing"
  | "system"
  | "social";

/** Options accepted by {@link NotificationService.list}. */
export interface ListNotificationsOptions {
  /** If true, only return unread notifications. */
  unreadOnly?: boolean;
  /** Cap the result count. Defaults to 20; max 100. */
  limit?: number;
}

/** Input shape for {@link NotificationService.create}. */
export interface CreateNotificationInput {
  type: NotificationType | string;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  /** Optional JSON-safe metadata (e.g. `{ invoiceId: "in_123" }`). */
  metadata?: Record<string, unknown> | null;
  /** Pre-mark as read (rare; useful when seeding a "welcome" notification already shown). */
  isRead?: boolean;
}

/** Maximum number of notifications returned by a single `list` call. */
const MAX_LIST_LIMIT = 100;

/**
 * Service object encapsulating all `notifications` operations. Constructed
 * with a typed Supabase client (server or admin).
 */
export class NotificationService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * List the caller's notifications (newest first). Optionally filter to
   * unread only and cap the result count.
   */
  async list(
    userId: string,
    opts: ListNotificationsOptions = {},
  ): Promise<Notification[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? 20, MAX_LIST_LIMIT));

    try {
      let query = this.supabase
        .from("notifications")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (opts.unreadOnly) {
        query = query.eq("is_read", false);
      }

      const { data, error } = await query;
      if (error) throw this.toDbError(error, "notifications list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing notifications.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Return the count of unread notifications for the caller. Used by the
   * dashboard bell badge.
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw this.toDbError(error, "getUnreadCount failed");
      return count ?? 0;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure counting unread notifications.",
        { userId, cause: appErr.message },
      );
    }
  }

  /**
   * Push a new notification to a user's feed. Intended for server-side
   * system callers (signup completion, billing webhooks, security alerts).
   *
   * @throws {ValidationError} if `title` or `message` is empty.
   * @throws {DatabaseError} on Supabase failure.
   */
  async create(
    userId: string,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    if (!input.title || !input.title.trim()) {
      throw new ValidationError("Notification title is required.");
    }
    if (!input.message || !input.message.trim()) {
      throw new ValidationError("Notification message is required.");
    }

    const insert: TablesInsert<"notifications"> = {
      user_id: userId,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      action_url: input.actionUrl ?? null,
      action_label: input.actionLabel ?? null,
      metadata: (input.metadata ?? null) as TablesInsert<"notifications">["metadata"],
      is_read: input.isRead ?? false,
    };

    try {
      const { data, error } = await this.supabase
        .from("notifications")
        .insert(insert)
        .select()
        .single();

      if (error) throw this.toDbError(error, "notifications create failed");
      if (!data) {
        throw new DatabaseError("notifications create returned no row.", {
          userId,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure creating notification.",
        { userId, cause: appErr.message },
      );
    }
  }

  /**
   * Mark a single notification as read. Idempotent — returns silently if
   * the notification is already read.
   *
   * @throws {NotFoundError} if no notification matches `(userId, notificationId)`.
   */
  async markRead(userId: string, notificationId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (error) throw this.toDbError(error, "markRead failed");
      if (!data) {
        throw new NotFoundError("Notification", notificationId, { userId });
      }
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure marking notification read.",
        { userId, notificationId, cause: appErr.message },
      );
    }
  }

  /** Mark every notification for the caller as read. Returns silently if none. */
  async markAllRead(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw this.toDbError(error, "markAllRead failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure marking all notifications read.",
        { userId, cause: appErr.message },
      );
    }
  }

  /**
   * Delete a single notification. Idempotent — returns silently if the
   * notification does not exist (or has already been deleted).
   */
  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", userId);

      if (error) throw this.toDbError(error, "deleteNotification failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure deleting notification.",
        { userId, notificationId, cause: appErr.message },
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
 * Build the canonical RLS-enforced `NotificationService` for use in
 * Server Components + Route Handlers. Only the caller's notifications are
 * reachable.
 */
export async function createNotificationService(): Promise<NotificationService> {
  const supabase = await createSupabaseServerClient();
  return new NotificationService(supabase);
}

/**
 * Build an admin `NotificationService` that bypasses RLS. Use only for
 * system operations that need to push notifications on behalf of arbitrary
 * users (e.g. signup completion, billing webhooks, security alerts).
 */
export function createNotificationServiceAdmin(): NotificationService {
  const supabase = createSupabaseAdminClient();
  return new NotificationService(supabase);
}
