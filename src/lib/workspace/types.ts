/**
 * Supa AI — Phase 9 Workspace & Collaboration — types.
 *
 * Domain-level types shared by the workspace service layer, API routes,
 * and the client UI. Plain TS types (no Zod, no `server-only`) so the
 * file is safe to import from client components via the
 * `@/lib/workspace/client` barrel.
 *
 * The DB-level row shapes live in `@/lib/supabase/types` (`Tables<'...'>`).
 * The types here are the *service* shape — narrower column sets, friendly
 * camelCase field names, and discriminated unions for status enums.
 *
 * @module @/lib/workspace/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Status / role / enum unions (mirror the CHECK constraints in
// 0009_phase7_workspace.sql)
// ---------------------------------------------------------------------------

/** Workspace type — see `workspaces.type` CHECK. */
export type WorkspaceType = "personal" | "team" | "organization";

/** Workspace member role — see `workspace_members.role` CHECK. */
export type WorkspaceRole =
  | "owner"
  | "admin"
  | "editor"
  | "viewer"
  | "member";

/** Workspace member status — see `workspace_members.status` CHECK. */
export type WorkspaceMemberStatus =
  | "active"
  | "invited"
  | "suspended"
  | "removed";

/** Document content type — see `documents.content_type` CHECK. */
export type DocumentContentType = "markdown" | "plain" | "html" | "json";

/** Document lifecycle status — see `documents.status` CHECK. */
export type DocumentStatus = "draft" | "published" | "archived";

/** Knowledge-base source type — see `knowledge_base.source_type` CHECK. */
export type KnowledgeSourceType =
  | "document"
  | "file"
  | "url"
  | "manual"
  | "ai-generated";

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

/** Full row of `workspaces`. */
export type Workspace = Tables<"workspaces">;
/** Full row of `workspace_members`. */
export type WorkspaceMember = Tables<"workspace_members">;
/** Full row of `folders`. */
export type Folder = Tables<"folders">;
/** Full row of `documents`. */
export type Document = Tables<"documents">;
/** Full row of `document_versions`. */
export type DocumentVersion = Tables<"document_versions">;
/** Full row of `comments`. */
export type Comment = Tables<"comments">;
/** Full row of `knowledge_base`. */
export type KnowledgeArticle = Tables<"knowledge_base">;
/** Full row of `file_library`. */
export type FileLibraryEntry = Tables<"file_library">;
/** Full row of `workspace_roles`. */
export type WorkspaceRoleRow = Tables<"workspace_roles">;
/** Full row of `workspace_activity`. */
export type WorkspaceActivity = Tables<"workspace_activity">;
/** Full row of `workspace_mentions`. */
export type WorkspaceMention = Tables<"workspace_mentions">;
/** Full row of `workspace_invitations`. */
export type WorkspaceInvitation = Tables<"workspace_invitations">;

/** Insert shape for `workspaces`. */
export type WorkspaceInsert = TablesInsert<"workspaces">;
/** Update shape for `workspaces`. */
export type WorkspaceUpdate = TablesUpdate<"workspaces">;
/** Insert shape for `workspace_members`. */
export type WorkspaceMemberInsert = TablesInsert<"workspace_members">;
/** Update shape for `workspace_members`. */
export type WorkspaceMemberUpdate = TablesUpdate<"workspace_members">;
/** Insert shape for `folders`. */
export type FolderInsert = TablesInsert<"folders">;
/** Update shape for `folders`. */
export type FolderUpdate = TablesUpdate<"folders">;
/** Insert shape for `documents`. */
export type DocumentInsert = TablesInsert<"documents">;
/** Update shape for `documents`. */
export type DocumentUpdate = TablesUpdate<"documents">;
/** Insert shape for `document_versions`. */
export type DocumentVersionInsert = TablesInsert<"document_versions">;
/** Insert shape for `comments`. */
export type CommentInsert = TablesInsert<"comments">;
/** Update shape for `comments`. */
export type CommentUpdate = TablesUpdate<"comments">;
/** Insert shape for `knowledge_base`. */
export type KnowledgeArticleInsert = TablesInsert<"knowledge_base">;
/** Update shape for `knowledge_base`. */
export type KnowledgeArticleUpdate = TablesUpdate<"knowledge_base">;
/** Insert shape for `file_library`. */
export type FileLibraryInsert = TablesInsert<"file_library">;
/** Insert shape for `workspace_activity`. */
export type WorkspaceActivityInsert = TablesInsert<"workspace_activity">;
/** Insert shape for `workspace_mentions`. */
export type WorkspaceMentionInsert = TablesInsert<"workspace_mentions">;
/** Insert shape for `workspace_invitations`. */
export type WorkspaceInvitationInsert = TablesInsert<"workspace_invitations">;

// ---------------------------------------------------------------------------
// Service-level DTOs (input shapes accepted by the service methods)
// ---------------------------------------------------------------------------

/** Input accepted by `WorkspaceService.create`. */
export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
  description?: string | null;
  logoUrl?: string | null;
  type?: WorkspaceType;
  settings?: Record<string, unknown> | null;
}

/** Input accepted by `WorkspaceService.update`. */
export interface UpdateWorkspaceInput {
  name?: string;
  slug?: string;
  description?: string | null;
  logoUrl?: string | null;
  type?: WorkspaceType;
  settings?: Record<string, unknown> | null;
  isArchived?: boolean;
  aiCreditsPool?: number;
}

/** Options accepted by `WorkspaceService.list`. */
export interface ListWorkspacesOptions {
  search?: string;
  type?: WorkspaceType;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

/** Input accepted by `WorkspaceService.inviteMember`. */
export interface InviteMemberInput {
  email: string;
  role?: WorkspaceRole;
}

/** Input accepted by `WorkspaceService.updateMemberRole`. */
export interface UpdateMemberInput {
  role?: WorkspaceRole;
  status?: WorkspaceMemberStatus;
}

/** Input accepted by `FolderService.create`. */
export interface CreateFolderInput {
  name: string;
  parentId?: string | null;
}

/** Input accepted by `FolderService.rename`. */
export interface RenameFolderInput {
  name: string;
}

/** Input accepted by `FolderService.move`. */
export interface MoveFolderInput {
  parentId?: string | null;
}

/** Input accepted by `DocumentService.create`. */
export interface CreateDocumentInput {
  title: string;
  content?: string | null;
  contentType?: DocumentContentType;
  folderId?: string | null;
  status?: DocumentStatus;
}

/** Input accepted by `DocumentService.update`. */
export interface UpdateDocumentInput {
  title?: string;
  content?: string | null;
  contentType?: DocumentContentType;
  folderId?: string | null;
  status?: DocumentStatus;
}

/** Options accepted by `DocumentService.list`. */
export interface ListDocumentsOptions {
  folderId?: string | null;
  search?: string;
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
}

/** Input accepted by `CommentService.create`. */
export interface CreateCommentInput {
  workspaceId: string;
  documentId?: string | null;
  parentId?: string | null;
  body: string;
}

/** Input accepted by `CommentService.update`. */
export interface UpdateCommentInput {
  body?: string;
  resolved?: boolean;
}

/** Options accepted by `CommentService.list`. */
export interface ListCommentsOptions {
  documentId?: string;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}

/** Input accepted by `KnowledgeService.create`. */
export interface CreateKnowledgeArticleInput {
  title: string;
  content?: string | null;
  source?: string | null;
  sourceType?: KnowledgeSourceType;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `KnowledgeService.update`. */
export interface UpdateKnowledgeArticleInput {
  title?: string;
  content?: string | null;
  source?: string | null;
  sourceType?: KnowledgeSourceType;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
}

/** Options accepted by `KnowledgeService.list`. */
export interface ListKnowledgeOptions {
  search?: string;
  tag?: string;
  sourceType?: KnowledgeSourceType;
  limit?: number;
  offset?: number;
}

/** Input accepted by `FileService.upload`. */
export interface UploadFileInput {
  fileName: string;
  fileContent: ArrayBuffer | Uint8Array | Blob;
  mimeType?: string | null;
  folderId?: string | null;
}

/** Result of `FileService.upload`. */
export interface UploadedFile {
  file: FileLibraryEntry;
  /** Public or signed URL the client can use to fetch the file. */
  url: string | null;
}

/** Options accepted by `WorkspaceActivityService.list`. */
export interface ListActivityOptions {
  resourceType?: string;
  resourceId?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

/** Options accepted by `MentionService.list`. */
export interface ListMentionsOptions {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

/** Input accepted by `MentionService.create`. */
export interface CreateMentionInput {
  workspaceId: string;
  documentId?: string | null;
  commentId?: string | null;
  mentionedUserId: string;
}

/** Options accepted by `SearchService.search`. */
export interface WorkspaceSearchOptions {
  query: string;
  kinds?: Array<"documents" | "knowledge" | "files" | "folders">;
  limit?: number;
}

/** Result of `SearchService.search`. */
export interface WorkspaceSearchResult {
  documents: Document[];
  knowledge: KnowledgeArticle[];
  files: FileLibraryEntry[];
  folders: Folder[];
}

/** Result of `WorkspaceService.getDashboard`. */
export interface WorkspaceDashboard {
  workspace: Workspace;
  memberCount: number;
  documentCount: number;
  folderCount: number;
  fileCount: number;
  knowledgeCount: number;
  commentCount: number;
  unreadMentionCount: number;
  storageUsedBytes: number;
  aiCreditsPool: number;
  recentActivity: WorkspaceActivity[];
  recentDocuments: Document[];
}

/** Result of `AiAssistant.ask`. */
export interface WorkspaceAiAnswer {
  answer: string;
  /** Article ids that contributed to the answer (for citation). */
  citedArticles: string[];
  provider?: string;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/** JSON value type accepted by Postgres jsonb columns. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];
