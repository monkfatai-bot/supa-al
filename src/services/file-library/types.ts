import type { FileLibrary } from '@/types/generated/database';

// ── Response helpers ────────────────────────────────────────────────────────

export interface FileActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

// ── Filters ─────────────────────────────────────────────────────────────────

export type FileSortField =
  | 'created_at'
  | 'updated_at'
  | 'file_name'
  | 'size_bytes';

export type SortOrder = 'asc' | 'desc';

export interface FileFilters {
  workspace_id?: string;
  folder_id?: string | null;
  mime_type?: string;
  search?: string;
  sort_by?: FileSortField;
  sort_order?: SortOrder;
}

// ── Enriched models ─────────────────────────────────────────────────────────

export interface FileWithUploader extends FileLibrary {
  uploader_name: string | null;
  uploader_avatar: string | null;
}

export type { FileLibrary };
