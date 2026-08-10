import type { Json } from '@/types/generated/database';

// ── Result types ────────────────────────────────────────────────────────────

export interface SearchResultItem {
  id: string;
  type: 'document' | 'folder' | 'file' | 'knowledge' | 'member' | 'company' | 'contact' | 'lead' | 'invoice' | 'project' | 'contract' | 'quotation' | 'expense' | 'receipt' | 'product' | 'employee' | 'task' | 'calendar_event' | 'supplier';
  title: string;
  description: string;
  workspace_id: string;
  created_at: string;
  metadata: Json;
}

// ── Filters ─────────────────────────────────────────────────────────────────

export type SearchSortField = 'created_at' | 'title' | 'relevance';
export type SortOrder = 'asc' | 'desc';

export interface SearchFilters {
  workspace_id?: string;
  types?: string[];
  query?: string;
  sort_by?: SearchSortField;
  sort_order?: SortOrder;
}

// ── Saved search ────────────────────────────────────────────────────────────

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  query: string;
  filters: Json;
  created_at: string;
}
