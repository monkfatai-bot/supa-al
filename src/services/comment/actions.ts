"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { createNotification } from "@/services/notification/actions";
import type { Comment, Mention, InsertTables } from "@/types/generated/database";
import type {
  CommentActionResponse,
  CommentWithAuthor,
  CreateCommentInput,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Build a profile map from profile rows. */
function buildProfileMap(
  profiles: Array<{ id: string; full_name: string | null; avatar_url: string | null }>,
): Map<string, { full_name: string | null; avatar_url: string | null }> {
  const map = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  for (const p of profiles) {
    map.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
  }
  return map;
}

/** Enrich a comment with author profile data. */
function enrichComment(
  comment: Comment,
  profileMap: Map<string, { full_name: string | null; avatar_url: string | null }>,
): CommentWithAuthor {
  const profile = profileMap.get(comment.author_id);
  return {
    ...comment,
    author_name: profile?.full_name ?? null,
    author_avatar: profile?.avatar_url ?? null,
  };
}

// ── Server actions ──────────────────────────────────────────────────────────

/**
 * Get comments for a document.
 */
export async function getComments(
  documentId: string,
): Promise<CommentActionResponse & { comments?: CommentWithAuthor[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: comments, error } = await supabase
    .from("comments")
    .select("*")
    .eq("document_id", documentId)
    .neq("status", "deleted")
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("Failed to fetch comments", { documentId, reason: error.message });
    return { success: false, message: "Failed to fetch comments.", error: "FETCH_FAILED" };
  }

  if (!comments || comments.length === 0) {
    return { success: true, message: "No comments.", comments: [] };
  }

  // Verify membership for the first comment's workspace
  try { await verifyWorkspaceMembership(comments[0].workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Batch-fetch author profiles
  const authorIds = [...new Set(comments.map((c) => c.author_id))];
  const { data: profiles } = authorIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", authorIds)
    : { data: [] };

  const profileMap = buildProfileMap(profiles ?? []);
  const enriched = comments.map((c) => enrichComment(c, profileMap));

  return { success: true, message: "Comments retrieved.", comments: enriched };
}

/**
 * Create a comment. If mentions are provided, creates mention records
 * and sends notifications to each mentioned user.
 */
export async function createComment(
  input: CreateCommentInput,
): Promise<CommentActionResponse & { comment?: Comment }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(input.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const trimmedContent = input.content.trim();
  if (!trimmedContent || trimmedContent.length > 10000) {
    return { success: false, message: "Comment must be 1-10000 characters.", error: "INVALID_CONTENT" };
  }

  const dbInsert: InsertTables<"comments"> = {
    workspace_id: input.workspace_id,
    document_id: input.document_id ?? null,
    parent_id: input.parent_id ?? null,
    author_id: profile.id,
    content: trimmedContent,
    content_html: trimmedContent,
    status: "active",
    mentions: input.mentions ?? [],
    metadata: {},
  };

  const { data: comment, error } = await supabase
    .from("comments")
    .insert(dbInsert)
    .select()
    .single();

  if (error || !comment) {
    logger.error("Failed to create comment", { workspaceId: input.workspace_id, reason: error?.message });
    return { success: false, message: "Failed to create comment.", error: "CREATE_FAILED" };
  }

  logger.info("Comment created", { commentId: comment.id, workspaceId: input.workspace_id });
  await logActivity("comment_added", `Added comment on document ${input.document_id ?? "general"}`, { comment_id: comment.id }, input.workspace_id);

  // Create mentions and notifications
  if (input.mentions && input.mentions.length > 0) {
    const mentionInserts: InsertTables<"mentions">[] = [];

    for (const mentionedUserId of input.mentions) {
      // Don't mention yourself
      if (mentionedUserId === profile.id) continue;

      mentionInserts.push({
        workspace_id: input.workspace_id,
        comment_id: comment.id,
        document_id: input.document_id ?? null,
        mentioned_user_id: mentionedUserId,
        mentioned_by: profile.id,
        is_read: false,
      });

      // Create notification for the mentioned user
      await createNotification(
        mentionedUserId,
        "mention",
        "You were mentioned in a comment",
        trimmedContent.slice(0, 200),
        input.document_id ? `/workspace/${input.workspace_id}/documents/${input.document_id}` : undefined,
        { comment_id: comment.id, workspace_id: input.workspace_id, mentioned_by: profile.id },
      );
    }

    if (mentionInserts.length > 0) {
      const { error: mentionError } = await supabase.from("mentions").insert(mentionInserts);
      if (mentionError) {
        logger.error("Failed to create mentions", { commentId: comment.id, reason: mentionError.message });
      }

      await logActivity("mention_created", `Mentioned ${mentionInserts.length} user(s) in a comment`, { comment_id: comment.id }, input.workspace_id);
    }
  }

  return { success: true, message: "Comment created.", comment };
}

/**
 * Update a comment's content.
 */
export async function updateComment(
  id: string,
  content: string,
): Promise<CommentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("comments")
    .select("*")
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Comment not found.", error: "NOT_FOUND" };
  }

  // Only the author can edit their comment
  if (existing.author_id !== profile.id) {
    return { success: false, message: "You can only edit your own comments.", error: "FORBIDDEN" };
  }

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 10000) {
    return { success: false, message: "Comment must be 1-10000 characters.", error: "INVALID_CONTENT" };
  }

  const { error: updateError } = await supabase
    .from("comments")
    .update({ content: trimmed, content_html: trimmed })
    .eq("id", id);

  if (updateError) {
    logger.error("Failed to update comment", { commentId: id, reason: updateError.message });
    return { success: false, message: "Failed to update comment.", error: "UPDATE_FAILED" };
  }

  return { success: true, message: "Comment updated." };
}

/**
 * Delete a comment (soft delete via status).
 */
export async function deleteComment(id: string): Promise<CommentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("comments")
    .select("*")
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Comment not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error: deleteError } = await supabase
    .from("comments")
    .update({ status: "deleted" })
    .eq("id", id);

  if (deleteError) {
    logger.error("Failed to delete comment", { commentId: id, reason: deleteError.message });
    return { success: false, message: "Failed to delete comment.", error: "DELETE_FAILED" };
  }

  return { success: true, message: "Comment deleted." };
}

/**
 * Resolve a comment.
 */
export async function resolveComment(id: string): Promise<CommentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("comments")
    .select("*")
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Comment not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error: resolveError } = await supabase
    .from("comments")
    .update({ status: "resolved", resolved_by: profile.id, resolved_at: new Date().toISOString() })
    .eq("id", id);

  if (resolveError) {
    logger.error("Failed to resolve comment", { commentId: id, reason: resolveError.message });
    return { success: false, message: "Failed to resolve comment.", error: "UPDATE_FAILED" };
  }

  await logActivity("comment_resolved", `Resolved comment on document ${existing.document_id ?? "general"}`, { comment_id: id }, existing.workspace_id);
  return { success: true, message: "Comment resolved." };
}

/**
 * Get the current user's unread mentions in a workspace.
 */
export async function getMentions(
  workspaceId: string,
): Promise<CommentActionResponse & { mentions?: Mention[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data, error } = await supabase
    .from("mentions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("mentioned_user_id", profile.id)
    .eq("is_read", false)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch mentions", { workspaceId, reason: error.message });
    return { success: false, message: "Failed to fetch mentions.", error: "FETCH_FAILED" };
  }

  return { success: true, message: "Mentions retrieved.", mentions: data ?? [] };
}

/**
 * Mark a single mention as read.
 */
export async function markMentionRead(id: string): Promise<CommentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("mentions")
    .update({ is_read: true })
    .eq("id", id)
    .eq("mentioned_user_id", profile.id);

  if (error) {
    logger.error("Failed to mark mention read", { mentionId: id, reason: error.message });
    return { success: false, message: "Failed to mark mention as read.", error: "UPDATE_FAILED" };
  }

  return { success: true, message: "Mention marked as read." };
}

/**
 * Mark all mentions as read for the current user.
 */
export async function markAllMentionsRead(): Promise<CommentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("mentions")
    .update({ is_read: true })
    .eq("mentioned_user_id", profile.id)
    .eq("is_read", false);

  if (error) {
    logger.error("Failed to mark all mentions read", { userId: profile.id, reason: error.message });
    return { success: false, message: "Failed to mark all mentions as read.", error: "UPDATE_FAILED" };
  }

  return { success: true, message: "All mentions marked as read." };
}
