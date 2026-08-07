/**
 * Supa AI — Phase 9 Workspace mention service.
 *
 * Owns the `workspace_mentions` table — @-mention notifications for
 * workspace members (on documents + comments). Mentioned users see them
 * in the workspace activity feed + their unread counter.
 *
 * @module @/lib/workspace/mention-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  CreateMentionInput,
  ListMentionsOptions,
  WorkspaceMention,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

class MentionService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * List mentions addressed to the caller (`mentioned_user_id = userId`).
   * Optionally filter to unread only. Newest first.
   */
  async listForUser(
    workspaceId: string,
    userId: string,
    opts: ListMentionsOptions = {},
  ): Promise<WorkspaceMention[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);

      let query = this.supabase
        .from("workspace_mentions")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("mentioned_user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.unreadOnly) {
        query = query.eq("is_read", false);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "mentions.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing mentions.", {
        workspaceId,
      });
    }
  }

  /** Create a mention. The caller is recorded as `mentioned_by`. */
  async create(
    workspaceId: string,
    userId: string,
    input: CreateMentionInput,
  ): Promise<WorkspaceMention> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    if (!input.mentionedUserId) {
      throw new ValidationError("mentionedUserId is required.");
    }
    if (input.mentionedUserId === userId) {
      throw new ValidationError("Cannot @-mention yourself.");
    }

    try {
      const { data, error } = await this.supabase
        .from("workspace_mentions")
        .insert({
          workspace_id: workspaceId,
          document_id: input.documentId ?? null,
          comment_id: input.commentId ?? null,
          mentioned_user_id: input.mentionedUserId,
          mentioned_by: userId,
          is_read: false,
        } as never)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "mentions.create failed");
      if (!data) throw new NotFoundError("Mention create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating mention.", {
        workspaceId,
        mentionedUserId: input.mentionedUserId,
      });
    }
  }

  /** Mark a mention as read (or unread). */
  async markRead(
    workspaceId: string,
    userId: string,
    mentionId: string,
    isRead: boolean,
  ): Promise<WorkspaceMention> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("workspace_mentions")
        .update({ is_read: isRead } as never)
        .eq("id", mentionId)
        .eq("workspace_id", workspaceId)
        .eq("mentioned_user_id", userId)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "mentions.markRead failed");
      if (!data) throw new NotFoundError("Mention", mentionId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating mention.", {
        mentionId,
      });
    }
  }

  /** Mark all unread mentions for the caller as read. Returns the count updated. */
  async markAllRead(
    workspaceId: string,
    userId: string,
  ): Promise<number> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("workspace_mentions")
        .update({ is_read: true } as never)
        .eq("workspace_id", workspaceId)
        .eq("mentioned_user_id", userId)
        .eq("is_read", false)
        .select("id");

      if (error) throw toDbError(error, "mentions.markAllRead failed");
      return data?.length ?? 0;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure marking mentions read.", {
        workspaceId,
      });
    }
  }
}

export async function createMentionService(): Promise<MentionService> {
  const supabase = await createSupabaseServerClient();
  return new MentionService(supabase);
}

export { MentionService };
