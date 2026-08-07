/**
 * Supa AI — Account management service (Phase 2).
 *
 * Owns the GDPR-flavored account lifecycle:
 *   - {@link deleteAccount}            — orchestrates data export → soft-delete →
 *                                       session revocation.
 *   - {@link requestDataExport}        — assembles the user's data into a JSON
 *                                       blob, uploads it to the private
 *                                       `uploads` bucket, and returns a 7-day
 *                                       signed URL.
 *   - {@link getDeletionRequest} /
 *     {@link listDeletionRequests}     — read-back for the dashboard.
 *
 * The service ALWAYS uses the **admin** Supabase client — these operations
 * must succeed outside an authenticated user context (post-deletion,
 * background export jobs, etc.) and must read rows the caller does not
 * strictly "own" (e.g. reading `notifications` while marking the profile
 * deleted — RLS would otherwise hide everything).
 *
 * `auth.users` is intentionally NOT deleted by this service — Supabase's
 * admin API handles that as a separate step. Instead, the profile is
 * soft-deleted (`account_status = 'deleted'`) so RLS policies (which all
 * key off `auth.uid()` + the live auth record) effectively hide every
 * other table from the user.
 *
 * @module @/lib/auth/account
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

import type { AnySupabaseClient } from "@/lib/auth/helpers";

/** Row shape for the `account_deletion_requests` table. */
export type AccountDeletionRequest = Tables<"account_deletion_requests">;

/** Bucket the data-export artifact is uploaded to. */
const DATA_EXPORT_BUCKET = "uploads" as const;
/** Signed-URL TTL for the data-export download (7 days). */
const DATA_EXPORT_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Per-section caps so the export stays within the 25 MB bucket limit. */
const EXPORT_LIMITS = {
  conversations: 100,
  messagesPerConversation: 100,
  notifications: 200,
  activityLogs: 500,
} as const;

/** Shape of the assembled data-export JSON document. */
export interface DataExportDocument {
  exportedAt: string;
  userId: string;
  profile: Tables<"profiles"> | null;
  settings: Tables<"user_settings"> | null;
  notifications: Tables<"notifications">[];
  activityLogs: Tables<"activity_logs">[];
  conversations: Array<{
    conversation: Tables<"ai_conversations">;
    messages: Tables<"ai_messages">[];
  }>;
}

/**
 * Service object encapsulating all account-management operations. Always
 * constructed with the admin Supabase client.
 */
export class AccountService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Orchestrate account deletion:
   *
   *   1. **Schedule data export first** (awaiting completion) — the user
   *      keeps a downloadable copy of their data even after deletion.
   *   2. **Mark the profile `deleted`** — RLS hides every other table from
   *      the user (their `auth.users` row is removed separately via the
   *      Supabase admin API by an out-of-band job).
   *   3. **Revoke every active session.**
   *
   * The deletion-request id (from step 1) is logged + persisted in the
   * `account_deletion_requests` table; the caller can look it up via
   * {@link listDeletionRequests}. The method itself returns `void`.
   *
   * @throws {DatabaseError} on any Supabase failure that cannot be
   *   recovered. Data-export failure does NOT abort deletion — the export
   *   row is marked `failed` and deletion proceeds (GDPR allows best-effort
   *   export; deletion is the user's actual request).
   */
  async deleteAccount(userId: string): Promise<void> {
    try {
      // Step 1: schedule + execute the data export. Best-effort — failure
      // is logged but does not abort the deletion.
      let exportRequest: AccountDeletionRequest | null = null;
      try {
        exportRequest = await this.requestDataExport(userId);
      } catch (err) {
        // The export method already marked its own row as 'failed' if it
        // threw; we just log + continue with the deletion.
        logger.warn("data export failed during account deletion", {
          userId,
          cause: (err as Error)?.message,
        });
      }

      // Step 2: soft-delete the profile. Uses admin client so it works even
      // after sessions are revoked.
      const { error: profileError } = await this.supabase
        .from("profiles")
        .update({ account_status: "deleted" })
        .eq("id", userId);

      if (profileError) {
        throw this.toDbError(profileError, "deleteAccount: profile update failed");
      }

      // Step 3: revoke every active session.
      const { error: sessionError } = await this.supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), is_current: false })
        .eq("user_id", userId)
        .is("revoked_at", null);

      if (sessionError) {
        throw this.toDbError(sessionError, "deleteAccount: session revocation failed");
      }

      logger.info("account deleted", {
        userId,
        exportRequestId: exportRequest?.id ?? null,
        exportStatus: exportRequest?.status ?? "skipped",
      });
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting account.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Assemble the user's data into a JSON document, upload it to the
   * private `uploads` bucket, and return a 7-day signed URL.
   *
   * Steps:
   *   1. Insert an `account_deletion_requests` row with
   *      `request_type='data_export'`, `status='pending'`.
   *   2. Gather profile + settings + notifications + activity_logs +
   *      conversations + messages (with sensible per-section caps).
   *   3. Update the row to `status='processing'`.
   *   4. Serialize to JSON, upload to
   *      `uploads/{userId}/exports/{requestId}/data-export.json`.
   *   5. Generate a 7-day signed URL.
   *   6. Update the row with `download_url`, `expires_at`,
   *      `completed_at`, `status='completed'`.
   *
   * On any failure, the row is updated to `status='failed'` and the
   * error is re-thrown (so the caller can decide whether to retry or
   * surface it).
   *
   * @returns The updated `account_deletion_requests` row.
   */
  async requestDataExport(userId: string): Promise<AccountDeletionRequest> {
    // Step 1: insert the request row.
    const insert: TablesInsert<"account_deletion_requests"> = {
      user_id: userId,
      request_type: "data_export",
      status: "pending",
    };

    let request: AccountDeletionRequest;
    try {
      const { data, error } = await this.supabase
        .from("account_deletion_requests")
        .insert(insert)
        .select()
        .single();

      if (error) throw this.toDbError(error, "requestDataExport: insert failed");
      if (!data) {
        throw new DatabaseError("requestDataExport: insert returned no row.", {
          userId,
        });
      }
      request = data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure creating data_export request.",
        { userId, cause: appErr.message },
      );
    }

    // Step 2-6: assemble + upload + sign. On any failure, mark the row
    // 'failed' and re-throw.
    try {
      await this.markRequest(request.id, { status: "processing" });

      const document = await this.assembleExportDocument(userId);
      const json = JSON.stringify(document, null, 2);
      const body = new TextEncoder().encode(json);

      const path = `${userId}/exports/${request.id}/data-export.json`;

      const { error: uploadError } = await this.supabase.storage
        .from(DATA_EXPORT_BUCKET)
        .upload(path, body, {
          contentType: "application/json",
          upsert: true,
          cacheControl: "private, max-age=0, no-store",
        });

      if (uploadError) {
        throw new DatabaseError("Data export upload failed.", {
          userId,
          requestId: request.id,
          path,
          cause: uploadError.message,
        });
      }

      const { data: signedUrlData, error: signedUrlError } =
        await this.supabase.storage
          .from(DATA_EXPORT_BUCKET)
          .createSignedUrl(path, DATA_EXPORT_URL_TTL_SECONDS);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        throw new DatabaseError("Data export signed-URL generation failed.", {
          userId,
          requestId: request.id,
          path,
          cause: signedUrlError?.message ?? "no signedUrl returned",
        });
      }

      const expiresAt = new Date(
        Date.now() + DATA_EXPORT_URL_TTL_SECONDS * 1000,
      ).toISOString();
      const completedAt = new Date().toISOString();

      const updated = await this.markRequest(request.id, {
        status: "completed",
        download_url: signedUrlData.signedUrl,
        expires_at: expiresAt,
        completed_at: completedAt,
      });

      logger.info("data export completed", {
        userId,
        requestId: request.id,
        expiresAt,
      });

      return updated;
    } catch (err) {
      // Mark the row 'failed' (best-effort — never throws from this catch).
      await this.markRequest(request.id, { status: "failed" }).catch(
        (markErr) => {
          logger.warn("failed to mark data_export request as failed", {
            userId,
            requestId: request.id,
            cause: (markErr as Error)?.message,
          });
        },
      );

      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Data export failed unexpectedly.", {
        userId,
        requestId: request.id,
        cause: appErr.message,
      });
    }
  }

  /**
   * Read a single deletion request by id. Returns `null` if the request
   * does not exist OR does not belong to `userId`.
   */
  async getDeletionRequest(
    userId: string,
    requestId: string,
  ): Promise<AccountDeletionRequest | null> {
    try {
      const { data, error } = await this.supabase
        .from("account_deletion_requests")
        .select()
        .eq("id", requestId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw this.toDbError(error, "getDeletionRequest failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure reading deletion request.",
        { userId, requestId, cause: appErr.message },
      );
    }
  }

  /** List every deletion request for the caller, newest first. */
  async listDeletionRequests(userId: string): Promise<AccountDeletionRequest[]> {
    try {
      const { data, error } = await this.supabase
        .from("account_deletion_requests")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw this.toDbError(error, "listDeletionRequests failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure listing deletion requests.",
        { userId, cause: appErr.message },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Assemble the {@link DataExportDocument} from the database. Uses the
   * admin client so it works after sessions have been revoked.
   *
   * Per-section caps (defined in {@link EXPORT_LIMITS}) keep the document
   * within the 25 MB `uploads` bucket limit for typical users.
   */
  private async assembleExportDocument(
    userId: string,
  ): Promise<DataExportDocument> {
    const [
      profileRes,
      settingsRes,
      notificationsRes,
      activityRes,
      conversationsRes,
    ] = await Promise.all([
      this.supabase.from("profiles").select().eq("id", userId).maybeSingle(),
      this.supabase.from("user_settings").select().eq("id", userId).maybeSingle(),
      this.supabase
        .from("notifications")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(EXPORT_LIMITS.notifications),
      this.supabase
        .from("activity_logs")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(EXPORT_LIMITS.activityLogs),
      this.supabase
        .from("ai_conversations")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(EXPORT_LIMITS.conversations),
    ]);

    if (profileRes.error) throw this.toDbError(profileRes.error, "export: profile failed");
    if (settingsRes.error) throw this.toDbError(settingsRes.error, "export: settings failed");
    if (notificationsRes.error) throw this.toDbError(notificationsRes.error, "export: notifications failed");
    if (activityRes.error) throw this.toDbError(activityRes.error, "export: activity failed");
    if (conversationsRes.error) throw this.toDbError(conversationsRes.error, "export: conversations failed");

    const conversations = conversationsRes.data ?? [];
    const conversationIds = conversations.map((c) => c.id);

    // Fetch messages for all conversations in a single round-trip.
    let messages: Tables<"ai_messages">[] = [];
    if (conversationIds.length > 0) {
      const { data: messageData, error: messageError } = await this.supabase
        .from("ai_messages")
        .select()
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true });
      if (messageError) {
        throw this.toDbError(messageError, "export: messages failed");
      }
      messages = messageData ?? [];
    }

    // Group messages by conversation, capping per-conversation.
    const messagesByConversation = new Map<string, Tables<"ai_messages">[]>();
    for (const m of messages) {
      const list = messagesByConversation.get(m.conversation_id) ?? [];
      if (list.length < EXPORT_LIMITS.messagesPerConversation) {
        list.push(m);
        messagesByConversation.set(m.conversation_id, list);
      }
    }

    return {
      exportedAt: new Date().toISOString(),
      userId,
      profile: profileRes.data ?? null,
      settings: settingsRes.data ?? null,
      notifications: notificationsRes.data ?? [],
      activityLogs: activityRes.data ?? [],
      conversations: conversations.map((conversation) => ({
        conversation,
        messages: messagesByConversation.get(conversation.id) ?? [],
      })),
    };
  }

  /**
   * Apply a partial update to a deletion-request row and return the
   * updated row.
   */
  private async markRequest(
    requestId: string,
    patch: TablesUpdate<"account_deletion_requests">,
  ): Promise<AccountDeletionRequest> {
    const { data, error } = await this.supabase
      .from("account_deletion_requests")
      .update(patch)
      .eq("id", requestId)
      .select()
      .single();

    if (error) {
      throw this.toDbError(error, "markRequest failed");
    }
    if (!data) {
      throw new NotFoundError("Deletion request", requestId);
    }
    return data;
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
 * Build the canonical `AccountService`. Always uses the admin Supabase
 * client — these operations must succeed outside an authenticated user
 * context (post-deletion, background export jobs).
 */
export function createAccountService(): AccountService {
  const supabase = createSupabaseAdminClient();
  return new AccountService(supabase);
}
