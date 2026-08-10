import type { Comment } from '@/types/generated/database';

// ── Response helpers ────────────────────────────────────────────────────────

export interface CommentActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

// ── Input types ─────────────────────────────────────────────────────────────

export interface CreateCommentInput {
  workspace_id: string;
  document_id?: string | null;
  parent_id?: string | null;
  content: string;
  mentions?: string[];
}

// ── Enriched models ─────────────────────────────────────────────────────────

export interface CommentWithAuthor extends Comment {
  author_name: string | null;
  author_avatar: string | null;
}

export type { Comment };
