import type { Folder } from "@/types/generated/database";

// ── Response helpers ────────────────────────────────────────────────────────

export interface FolderActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface GetFolderResponse extends FolderActionResponse {
  folder?: Folder;
}

// ── Enriched models ─────────────────────────────────────────────────────────

export interface FolderWithChildren extends Folder {
  children: Folder[];
}

export interface FolderTreeItem {
  id: string;
  name: string;
  parent_id: string | null;
  children: FolderTreeItem[];
  document_count: number;
  color: string;
  icon: string;
  is_archived: boolean;
  is_favorite: boolean;
}

export type FolderTree = FolderTreeItem[];

export type { Folder };
