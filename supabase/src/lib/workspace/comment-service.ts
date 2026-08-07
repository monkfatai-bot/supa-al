/**
 * Supa AI — Phase 9 Workspace comment service.
 *
 * Owns the `comments` table — threaded comments on documents (and
 * optionally at the workspace level). Operations: create, list, resolve,
 * delete. Authors can edit/delete their own comments; admins can resolve
 * + delete any comment.
 *
 * @module @/lib/workspace/comment-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  Comment,
  CreateCommentInput,
  ListCommentsOptions,
  UpdateCommentInput,
} from "./types";
import {
  ADMIN_ROLES,
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

class CommentService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Paginated list of comments. Optionally filter by `documentId` and
   * `resolved`. Returns newest first.
   */
  async list(
    workspaceId: string,
    userId: string,
    opts: ListCommentsOptions = {},
  ): Promise<Comment[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);

      let query = this.supabase
        .from("comments")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.documentId) {
        query = query.eq("document_id", opts.documentId);
      }
      if (opts.resolved !== undefined) {
        query = query.eq("resolved", opts.resolved);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "comments.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing comments.", {
        workspaceId,
      });
    }
  }

  /** Create a comment. The caller is recorded as the author. */
  async create(
    workspaceId: string,
    userId: string,
    input: CreateCommentInput,
  ): Promise<Comment> {
    const body = input.body?.trim();
    if (!body) {
      throw new ValidationError("Comment body is required.");
    }
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("comments")
        .insert({
          workspace_id: input.workspaceId,
          document_id: input.documentId ?? null,
          parent_id: input.parentId ?? null,
          author_id: userId,
          body,
          resolved: false,
        } as never)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "comments.create failed");
      if (!data) throw new NotFoundError("Comment create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating comment.", {
        workspaceId,
      });
    }
  }

  /**
   * Update a comment. The author can edit the body; admins (and the
   * author) can resolve / unresolve. Returns the updated row.
   */
  async update(
    workspaceId: string,
    userId: string,
    commentId: string,
    input: UpdateCommentInput,
  ): Promise<Comment> {
    const membership = await assertMember(this.supabase, workspaceId, userId);

    try {
      const { data: existing, error: fetchErr } = await this.supabase
        .from("comments")
        .select()
        .eq("id", commentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "comments.update lookup failed");
      if (!existing) throw new NotFoundError("Comment", commentId);

      const patch: Record<string, unknown> = {};
      if (input.body !== undefined) {
        if (existing.author_id !== userId) {
          throw new ValidationError("Only the author can edit a comment body.");
        }
        const trimmed = input.body.trim();
        if (!trimmed) {
          throw new ValidationError("Comment body cannot be empty.");
        }
        patch.body = trimmed;
      }
      if (input.resolved !== undefined) {
        // Authors can resolve their own comments; admins can resolve any.
        if (
          existing.author_id !== userId &&
          !ADMIN_ROLES.includes(membership.role)
        ) {
          throw new ValidationError(
            "Only the author or a workspace admin can resolve a comment.",
          );
        }
        patch.resolved = input.resolved;
      }

      if (Object.keys(patch).length === 0) {
        throw new ValidationError("No fields supplied for update.");
      }

      const { data, error } = await this.supabase
        .from("comments")
        .update(patch as never)
        .eq("id", commentId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "comments.update failed");
      if (!data) throw new NotFoundError("Comment", commentId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating comment.", {
        commentId,
      });
    }
  }

  /** Delete a comment. Author or admin. */
  async delete(
    workspaceId: string,
    userId: string,
    commentId: string,
  ): Promise<void> {
    const membership = await assertMember(this.supabase, workspaceId, userId);

    try {
      const { data: existing, error: fetchErr } = await this.supabase
        .from("comments")
        .select("author_id")
        .eq("id", commentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "comments.delete lookup failed");
      if (!existing) throw new NotFoundError("Comment", commentId);

      if (
        existing.author_id !== userId &&
        !ADMIN_ROLES.includes(membership.role)
      ) {
        throw new ValidationError(
          "Only the author or a workspace admin can delete a comment.",
        );
      }

      const { error } = await this.supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("workspace_id", workspaceId);

      if (error) throw toDbError(error, "comments.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting comment.", {
        commentId,
      });
    }
  }
}

export async function createCommentService(): Promise<CommentService> {
  const supabase = await createSupabaseServerClient();
  return new CommentService(supabase);
}

export { CommentService };
