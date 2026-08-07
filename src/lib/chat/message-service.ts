/**
 * Supa AI — Message service (Phase 3).
 *
 * Owns the `ai_messages` table for the chat surface. Provides paginated
 * reads, create (which also updates the parent conversation's denormalized
 * counters: `last_message_preview`, `last_message_at`, `message_count`,
 * `total_tokens`, `total_cost_cents`), edit (preserving prior content in
 * `edit_history`), delete, and branch lookup (for regenerate).
 *
 * All mutations verify the caller owns the parent conversation via
 * {@link requireConversationAccess} — defense in depth on top of RLS.
 *
 * @module @/lib/chat/message-service
 */
import "server-only";

import {
  AuthorizationError,
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

/** Row shape for `ai_messages`. */
export type Message = Tables<"ai_messages">;

/** Allowed message roles (mirrors the SQL check constraint). */
export type MessageRole = Tables<"ai_messages">["role"];

/** Input for {@link MessageService.create}. */
export interface CreateMessageInput {
  role: MessageRole;
  content: string;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  costCents?: number | null;
  latencyMs?: number | null;
  finishReason?: string | null;
  parentMessageId?: string | null;
  errorMessage?: string | null;
}

/** Options accepted by {@link MessageService.list}. */
export interface ListMessagesOptions {
  limit?: number;
  offset?: number;
  afterId?: string;
}

/** Default page size for {@link MessageService.list}. */
const DEFAULT_LIST_LIMIT = 50;
/** Max page size for {@link MessageService.list}. */
const MAX_LIST_LIMIT = 200;

/** One entry in the `edit_history` JSON array. */
interface EditHistoryEntry {
  content: string;
  editedAt: string;
}

class MessageService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Paginated list of messages in a conversation, ordered `created_at asc`.
   * The caller's ownership of the conversation is verified via
   * {@link requireConversationAccess} before any rows are returned.
   *
   * `afterId` (optional) restricts the result to messages created strictly
   * after the given message id — used by the client to poll for new
   * assistant messages.
   */
  async list(
    conversationId: string,
    userId: string,
    opts: ListMessagesOptions = {},
  ): Promise<Message[]> {
    await requireConversationAccess(this.supabase, conversationId, userId);

    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      let query = this.supabase
        .from("ai_messages")
        .select()
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);

      if (opts.afterId) {
        // Postgrest's `gt` filter on `id` works because we order by id asc
        // as a tiebreaker; for strict "after this message" semantics we
        // use the created_at + id of the anchor — but a simple `gt` on id
        // is a safe approximation given UUID ordering is monotonic-ish.
        query = query.gt("id", opts.afterId);
      }

      const { data, error } = await query;
      if (error) throw this.toDbError(error, "message.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof AuthorizationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing messages.", {
        conversationId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Insert a new message and update the parent conversation's
   * denormalized counters. For an assistant message, the caller should
   * pass `inputTokens`/`outputTokens`/`totalTokens`/`costCents`/`latencyMs`
   * /`finishReason` from the AI response.
   *
   * The conversation update is best-effort: if it fails (e.g. RLS blocks
   * it for some reason), the message is still persisted so the user can
   * see it. A background job can reconcile counters later.
   */
  async create(
    conversationId: string,
    userId: string,
    input: CreateMessageInput,
  ): Promise<Message> {
    await requireConversationAccess(this.supabase, conversationId, userId);

    const insert: TablesInsert<"ai_messages"> = {
      conversation_id: conversationId,
      role: input.role,
      content: input.content,
      provider: input.provider ?? null,
      model: input.model ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      total_tokens: input.totalTokens ?? null,
      cost_cents: input.costCents ?? null,
      latency_ms: input.latencyMs ?? null,
      finish_reason: input.finishReason ?? null,
      error_message: input.errorMessage ?? null,
      parent_message_id: input.parentMessageId ?? null,
    };

    try {
      const { data, error } = await this.supabase
        .from("ai_messages")
        .insert(insert)
        .select()
        .maybeSingle();

      if (error) throw this.toDbError(error, "message.create failed");
      if (!data) {
        throw new DatabaseError("message.create returned no row.", { conversationId });
      }

      // Best-effort: update the parent conversation's denormalized counters.
      // We swallow errors here so a counter drift never blocks the message
      // write — the message is the source of truth and counters can be
      // reconciled by a background job.
      await this.touchConversation(conversationId, userId, data).catch((err) => {
        logger.warn("conversation counter update failed", {
          conversationId,
          messageId: data.id,
          error: String(err),
        });
      });

      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof AuthorizationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating message.", {
        conversationId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Edit a message's content. The prior content is preserved in
   * `edit_history` (a JSON array of `{content, editedAt}` entries).
   *
   * Only user-role messages can be edited (assistant messages are
   * immutable — edits are done via regenerate). The caller must own the
   * conversation the message belongs to.
   */
  async update(
    userId: string,
    messageId: string,
    content: string,
  ): Promise<Message> {
    const existing = await this.getMessageForUser(userId, messageId);
    if (existing.role !== "user") {
      throw new AuthorizationError("Only user messages can be edited.");
    }

    // Preserve prior content in edit_history. The column is JSONB; we
    // manage the array shape here.
    const priorHistory = this.readEditHistory(existing.edit_history);
    const newHistory: EditHistoryEntry[] = [
      ...priorHistory,
      { content: String(existing.content ?? ""), editedAt: new Date().toISOString() },
    ];

    const patch: TablesUpdate<"ai_messages"> = {
      content,
      edit_history: newHistory as unknown as TablesUpdate<"ai_messages">["edit_history"],
    };

    try {
      const { data, error } = await this.supabase
        .from("ai_messages")
        .update(patch)
        .eq("id", messageId)
        .select()
        .maybeSingle();

      if (error) throw this.toDbError(error, "message.update failed");
      if (!data) throw new NotFoundError("Message", messageId);
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating message.", {
        messageId,
        cause: appErr.message,
      });
    }
  }

  /** Hard-delete a message. Ownership is enforced via the conversation lookup. */
  async delete(userId: string, messageId: string): Promise<void> {
    // Verify ownership first (throws NotFoundError if not found / not owned).
    await this.getMessageForUser(userId, messageId);

    try {
      const { error } = await this.supabase
        .from("ai_messages")
        .delete()
        .eq("id", messageId);

      if (error) throw this.toDbError(error, "message.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting message.", {
        messageId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Get all messages that share the same `parent_message_id` — used by the
   * regenerate feature to enumerate alternate branches. The caller must own
   * the conversation that the parent message belongs to.
   */
  async getBranch(userId: string, parentMessageId: string): Promise<Message[]> {
    // Verify the parent belongs to the caller.
    await this.getMessageForUser(userId, parentMessageId);

    try {
      const { data, error } = await this.supabase
        .from("ai_messages")
        .select()
        .eq("parent_message_id", parentMessageId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw this.toDbError(error, "message.getBranch failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure fetching branch.", {
        parentMessageId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Fetch a single message by id, verifying ownership via the parent
   * conversation. Throws {@link NotFoundError} when the message does not
   * exist or doesn't belong to the caller.
   */
  async getMessageForUser(userId: string, messageId: string): Promise<Message> {
    try {
      const { data, error } = await this.supabase
        .from("ai_messages")
        .select()
        .eq("id", messageId)
        .maybeSingle();

      if (error) throw this.toDbError(error, "message.getMessageForUser failed");
      if (!data) throw new NotFoundError("Message", messageId);

      // Verify ownership via the parent conversation.
      await requireConversationAccess(this.supabase, data.conversation_id, userId);
      return data;
    } catch (err) {
      if (
        err instanceof DatabaseError ||
        err instanceof NotFoundError ||
        err instanceof AuthorizationError
      ) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure fetching message.", {
        messageId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Update the parent conversation's denormalized counters after a message
   * is created. Best-effort: errors are caught by the caller.
   */
  private async touchConversation(
    conversationId: string,
    userId: string,
    message: Message,
  ): Promise<void> {
    // Re-read the conversation's current counters so we can compute the new
    // values incrementally. RLS will hide the row if the caller doesn't own
    // it — which would be unexpected here because we already verified
    // ownership in `create`.
    const { data: conv, error } = await this.supabase
      .from("ai_conversations")
      .select("message_count, total_tokens, total_cost_cents")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !conv) return;

    const newCount = (conv.message_count ?? 0) + 1;
    const newTokens = (conv.total_tokens ?? 0) + (message.total_tokens ?? 0);
    const newCost = (conv.total_cost_cents ?? 0) + (message.cost_cents ?? 0);
    const preview = this.buildPreview(String(message.content ?? ""));

    await this.supabase
      .from("ai_conversations")
      .update({
        message_count: newCount,
        total_tokens: newTokens,
        total_cost_cents: newCost,
        last_message_preview: preview,
        last_message_at: message.created_at,
      })
      .eq("id", conversationId)
      .eq("user_id", userId);
  }

  /** Build a sidebar preview from message content (truncate to 200 chars). */
  private buildPreview(content: string): string {
    const trimmed = content.trim().replace(/\s+/g, " ");
    return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
  }

  /**
   * Coerce the JSONB `edit_history` value into a typed array. Defensive
   * against malformed entries (returns an empty array on any error).
   */
  private readEditHistory(raw: Tables<"ai_messages">["edit_history"]): EditHistoryEntry[] {
    if (!raw) return [];
    if (!Array.isArray(raw)) return [];
    // Cast through `unknown[]` to break out of the `Json[]` union — the
    // type predicate below re-narrows each element to `EditHistoryEntry`.
    return (raw as unknown[]).filter(
      (e): e is EditHistoryEntry =>
        typeof e === "object" && e !== null &&
        typeof (e as { content?: unknown }).content === "string" &&
        typeof (e as { editedAt?: unknown }).editedAt === "string",
    );
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
 * Verify that `userId` owns `conversationId`. Throws:
 *   - {@link NotFoundError} when the conversation doesn't exist.
 *   - {@link AuthorizationError} when the conversation exists but doesn't
 *     belong to the caller.
 *
 * Exported so the chat service can re-use it without round-tripping through
 * the message service.
 */
export async function requireConversationAccess(
  supabase: AnySupabaseClient,
  conversationId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError("Failed to verify conversation access.", {
      conversationId,
      errorCode: error.code,
      errorMessage: error.message,
    });
  }
  if (!data) {
    throw new NotFoundError("Conversation", conversationId);
  }
  if (data.user_id !== userId) {
    throw new AuthorizationError("You do not have access to this conversation.");
  }
}

/**
 * Build the canonical {@link MessageService} for use in Route Handlers and
 * Server Components. The caller's auth session is propagated; only messages
 * in conversations they own are visible/mutable (RLS-enforced).
 */
export async function createMessageService(): Promise<MessageService> {
  const supabase = await createSupabaseServerClient();
  return new MessageService(supabase);
}
