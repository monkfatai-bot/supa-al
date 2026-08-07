/**
 * Supa AI — Conversation service (Phase 3).
 *
 * Owns the `ai_conversations` table for the chat surface. Provides CRUD,
 * archive, pin, move-to-folder, search (via the FTS index on title + last
 * message preview), and a `getRecent` shortcut for the dashboard.
 *
 * Constructed with a Supabase client (server, RLS-enforced by default; admin
 * for back-office operations). All mutations filter on `user_id` so RLS is
 * reinforced at the query layer — defense in depth.
 *
 * @module @/lib/chat/conversation-service
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

/** Row shape for `ai_conversations`. */
export type Conversation = Tables<"ai_conversations">;

/** Input for {@link ConversationService.create}. */
export interface CreateConversationInput {
  title?: string | null;
  provider?: string | null;
  model?: string | null;
  systemPrompt?: string | null;
  folderId?: string | null;
}

/** Options accepted by {@link ConversationService.list}. */
export interface ListConversationsOptions {
  archived?: boolean;
  folderId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Default page size for {@link ConversationService.list}. */
const DEFAULT_LIST_LIMIT = 30;
/** Max page size for {@link ConversationService.list}. */
const MAX_LIST_LIMIT = 100;

class ConversationService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Paginated list of the caller's conversations. Pinned first, then by
   * `last_message_at desc` (falling back to `created_at`).
   *
   * Filters:
   *   - `archived` (default false) — whether to include archived conversations.
   *   - `folderId` — restrict to a folder (pass `null` to exclude folders,
   *     omit to include all).
   *   - `search` — match against the FTS index (title + last_message_preview).
   */
  async list(
    userId: string,
    opts: ListConversationsOptions = {},
  ): Promise<Conversation[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    const archived = opts.archived ?? false;

    try {
      let query = this.supabase
        .from("ai_conversations")
        .select()
        .eq("user_id", userId)
        .eq("archived", archived)
        .order("pinned", { ascending: false })
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.folderId !== undefined) {
        query = query.eq("folder_id", opts.folderId);
      }

      if (opts.search && opts.search.trim().length > 0) {
        // Postgrest `textSearch` builds `to_tsvector(<column>) @@ to_tsquery(<q>)`
        // on a single column, but our FTS index covers a generated tsvector
        // over title + last_message_preview. The expression-based GIN index
        // isn't selectable through Postgrest's helpers, so we fall back to
        // ILIKE on both columns — which works correctly and remains
        // index-friendly thanks to the standard pg_trgm index. A future
        // phase can expose a `search_conversations()` RPC for true FTS.
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `title.ilike.%${term}%,last_message_preview.ilike.%${term}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw this.toDbError(error, "conversation.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing conversations.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Fetch a single conversation with ownership check. Returns `null` when
   * the conversation does not exist OR does not belong to the caller (RLS
   * would hide the row anyway — the `eq('user_id')` filter is the
   * defense-in-depth at the query layer).
   */
  async get(
    userId: string,
    conversationId: string,
  ): Promise<Conversation | null> {
    try {
      const { data, error } = await this.supabase
        .from("ai_conversations")
        .select()
        .eq("id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw this.toDbError(error, "conversation.get failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading conversation.", {
        userId,
        conversationId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Create a new conversation for the caller. Defaults `title` to
   * `"New conversation"` + a human-readable timestamp when omitted.
   */
  async create(
    userId: string,
    input: CreateConversationInput,
  ): Promise<Conversation> {
    const title = (input.title ?? "").trim() || this.defaultTitle();
    const insert: TablesInsert<"ai_conversations"> = {
      user_id: userId,
      title,
      provider: input.provider ?? null,
      model: input.model ?? null,
      system_prompt: input.systemPrompt ?? null,
      folder_id: input.folderId ?? null,
      pinned: false,
      archived: false,
      message_count: 0,
      total_tokens: 0,
      total_cost_cents: 0,
    };

    try {
      const { data, error } = await this.supabase
        .from("ai_conversations")
        .insert(insert)
        .select()
        .maybeSingle();

      if (error) throw this.toDbError(error, "conversation.create failed");
      if (!data) {
        throw new DatabaseError("conversation.create returned no row.", {
          userId,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating conversation.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /** Rename the conversation. Ownership is enforced via the `eq('user_id')` filter. */
  async rename(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<Conversation> {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new ValidationError("Title must not be empty.");
    }
    return this.update(userId, conversationId, { title: trimmed });
  }

  /** Hard-delete the conversation. Cascades to `ai_messages` via the FK. */
  async delete(userId: string, conversationId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("ai_conversations")
        .delete()
        .eq("id", conversationId)
        .eq("user_id", userId);

      if (error) throw this.toDbError(error, "conversation.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting conversation.", {
        userId,
        conversationId,
        cause: appErr.message,
      });
    }
  }

  /** Archive or unarchive. Returns the updated row. */
  async archive(
    userId: string,
    conversationId: string,
    archived: boolean,
  ): Promise<Conversation> {
    return this.update(userId, conversationId, { archived });
  }

  /** Pin or unpin. Returns the updated row. */
  async pin(
    userId: string,
    conversationId: string,
    pinned: boolean,
  ): Promise<Conversation> {
    return this.update(userId, conversationId, { pinned });
  }

  /**
   * Move the conversation to a folder. Pass `null` to move it out of any
   * folder. Returns the updated row.
   */
  async moveToFolder(
    userId: string,
    conversationId: string,
    folderId: string | null,
  ): Promise<Conversation> {
    return this.update(userId, conversationId, { folder_id: folderId });
  }

  /**
   * Fetch the caller's most recent conversations (for the dashboard).
   * Excludes archived. Sorted by `last_message_at desc`.
   */
  async getRecent(userId: string, limit = 10): Promise<Conversation[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    try {
      const { data, error } = await this.supabase
        .from("ai_conversations")
        .select()
        .eq("user_id", userId)
        .eq("archived", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(safeLimit);

      if (error) throw this.toDbError(error, "conversation.getRecent failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure fetching recent conversations.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Internal partial-update helper. Filters on `id` + `user_id` (ownership
   * defense-in-depth) and throws {@link NotFoundError} when the row doesn't
   * exist or doesn't belong to the caller.
   */
  private async update(
    userId: string,
    conversationId: string,
    patch: TablesUpdate<"ai_conversations">,
  ): Promise<Conversation> {
    try {
      const { data, error } = await this.supabase
        .from("ai_conversations")
        .update(patch)
        .eq("id", conversationId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();

      if (error) throw this.toDbError(error, "conversation.update failed");
      if (!data) {
        throw new NotFoundError("Conversation", conversationId);
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating conversation.", {
        userId,
        conversationId,
        cause: appErr.message,
      });
    }
  }

  /** Default title: `"New conversation"` + a locale-aware timestamp. */
  private defaultTitle(): string {
    const stamp = new Date().toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `New conversation · ${stamp}`;
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
 * Build the canonical {@link ConversationService} for use in Route Handlers
 * and Server Components. The caller's auth session is propagated; only their
 * own conversations are visible/mutable (RLS-enforced).
 */
export async function createConversationService(): Promise<ConversationService> {
  const supabase = await createSupabaseServerClient();
  return new ConversationService(supabase);
}

/**
 * Build an admin {@link ConversationService} that bypasses RLS. Use only for
 * system operations (back-office moderation, exports).
 */
export function createConversationServiceAdmin(): ConversationService {
  return new ConversationService(createSupabaseAdminClient());
}
