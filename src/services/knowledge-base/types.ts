import type { KnowledgeBase, KnowledgeEntryType } from '@/types/generated/database';

// ── Response helpers ────────────────────────────────────────────────────────

export interface KnowledgeActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

// ── Filters ─────────────────────────────────────────────────────────────────

export type KnowledgeSortField =
  | 'created_at'
  | 'updated_at'
  | 'title'
  | 'category';

export type SortOrder = 'asc' | 'desc';

export interface KnowledgeFilters {
  workspace_id?: string;
  category?: string;
  entry_type?: KnowledgeEntryType;
  search?: string;
  tags?: string[];
  sort_by?: KnowledgeSortField;
  sort_order?: SortOrder;
}

// ── Enriched models ─────────────────────────────────────────────────────────

export interface KnowledgeWithCreator extends KnowledgeBase {
  creator_name: string | null;
}

export type { KnowledgeBase, KnowledgeEntryType };
