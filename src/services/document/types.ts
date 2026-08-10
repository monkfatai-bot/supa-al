import type { Document, DocumentVersion, DocumentType, DocumentStatus } from "@/types/generated/database";

// ── Response helpers ────────────────────────────────────────────────────────

export interface DocumentActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface GetDocumentResponse extends DocumentActionResponse {
  document?: DocumentWithCreator;
}

// ── Enriched models ─────────────────────────────────────────────────────────

export interface DocumentWithCreator extends Document {
  creator_name: string | null;
  creator_avatar: string | null;
}

export interface DocumentVersionWithCreator extends DocumentVersion {
  creator_name: string | null;
  creator_avatar: string | null;
}

// ── Filters & list options ──────────────────────────────────────────────────

export type DocumentSortField =
  | "updated_at"
  | "created_at"
  | "title"
  | "word_count"
  | "version_number";

export type SortOrder = "asc" | "desc";

export interface DocumentFilters {
  workspace_id?: string;
  folder_id?: string;
  document_type?: DocumentType;
  status?: DocumentStatus;
  search?: string;
  tags?: string[];
  is_favorite?: boolean;
  sort_by?: DocumentSortField;
  sort_order?: SortOrder;
}

export interface DocumentListOptions {
  filters: DocumentFilters;
  page?: number;
  page_size?: number;
}

// ── AI assistant types ──────────────────────────────────────────────────────

export type AiAssistantAction =
  | "rewrite"
  | "expand"
  | "summarize"
  | "translate"
  | "improve_grammar"
  | "generate_title"
  | "create_outline"
  | "continue_writing"
  | "explain"
  | "generate_table"
  | "generate_code";

export interface AiAssistantRequest {
  action: AiAssistantAction;
  text: string;
  language?: string;
  context?: string;
}

export interface AiAssistantResponse {
  success: boolean;
  result?: string;
  error?: string;
}

export type {
  Document,
  DocumentVersion,
  DocumentType,
  DocumentStatus,
};
