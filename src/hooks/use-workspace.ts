"use client";

/**
 * Supa AI — Phase 9 Workspace data hooks.
 *
 * TanStack Query wrappers for every `/api/workspace/*` REST endpoint
 * the workspace UI consumes. Each hook returns the standard TanStack
 * Query result; mutations invalidate the relevant query keys so the
 * UI stays in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * @module @/hooks/use-workspace
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  Comment,
  CreateCommentInput,
  CreateDocumentInput,
  CreateFolderInput,
  CreateKnowledgeArticleInput,
  CreateWorkspaceInput,
  Document,
  DocumentVersion,
  Folder,
  KnowledgeArticle,
  UpdateCommentInput,
  UpdateDocumentInput,
  UpdateKnowledgeArticleInput,
  UpdateMemberInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceActivity,
  WorkspaceDashboard,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceSearchOptions,
  WorkspaceSearchResult,
} from "@/lib/workspace/client";
import type { InviteMemberInput } from "@/lib/workspace/client";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const workspaceKeys = {
  all: ["workspace"] as const,
  list: (opts?: { search?: string; type?: string; includeArchived?: boolean }) =>
    [
      "workspace",
      "list",
      opts?.search ?? "",
      opts?.type ?? "",
      opts?.includeArchived ?? false,
    ] as const,
  detail: (id: string | null) => ["workspace", "detail", id ?? null] as const,
  dashboard: (id: string | null) =>
    ["workspace", "dashboard", id ?? null] as const,
  members: (id: string | null) => ["workspace", "members", id ?? null] as const,
  folders: (id: string | null) => ["workspace", "folders", id ?? null] as const,
  documents: (
    id: string | null,
    opts?: { folderId?: string | null; search?: string; status?: string },
  ) =>
    [
      "workspace",
      "documents",
      id ?? null,
      opts?.folderId ?? null,
      opts?.search ?? "",
      opts?.status ?? "",
    ] as const,
  document: (id: string | null) =>
    ["workspace", "document", id ?? null] as const,
  versions: (docId: string | null) =>
    ["workspace", "document-versions", docId ?? null] as const,
  knowledge: (
    id: string | null,
    opts?: { search?: string; tag?: string; sourceType?: string },
  ) =>
    [
      "workspace",
      "knowledge",
      id ?? null,
      opts?.search ?? "",
      opts?.tag ?? "",
      opts?.sourceType ?? "",
    ] as const,
  activity: (id: string | null) =>
    ["workspace", "activity", id ?? null] as const,
  comments: (
    workspaceId: string | null,
    opts?: { documentId?: string; resolved?: boolean },
  ) =>
    [
      "workspace",
      "comments",
      workspaceId ?? null,
      opts?.documentId ?? null,
      opts?.resolved ?? null,
    ] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface WorkspaceApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<WorkspaceApiError> {
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    return { message: `Request failed (${res.status}).`, status: res.status };
  }
  const envelope = raw as ApiResponse<never>;
  if (envelope && envelope.success === false && envelope.error) {
    return {
      message: envelope.error.message,
      code: envelope.error.code,
      status: res.status,
    };
  }
  return { message: `Request failed (${res.status}).`, status: res.status };
}

/**
 * Issue a JSON request and either return the typed `data` payload or
 * throw a normalized {@link WorkspaceApiError}.
 */
async function apiRequest<T>(
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers:
      body !== undefined && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal,
  };
  const res = await fetch(url, init);
  if (!res.ok) {
    throw await unwrapError(res);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw {
      message: json.error?.message ?? "Unexpected response shape.",
      code: json.error?.code,
    } as WorkspaceApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Workspace CRUD
// ---------------------------------------------------------------------------

/** GET `/api/workspace/workspaces` — list workspaces owned by the caller. */
export function useWorkspaces(opts: {
  search?: string;
  type?: string;
  includeArchived?: boolean;
} = {}) {
  return useQuery({
    queryKey: workspaceKeys.list(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.search) p.set("search", opts.search);
      if (opts.type) p.set("type", opts.type);
      if (opts.includeArchived) p.set("includeArchived", "true");
      const qs = p.toString();
      return apiRequest<{ workspaces: Workspace[] }>(
        "GET",
        `/api/workspace/workspaces${qs ? `?${qs}` : ""}`,
      ).then((r) => r.workspaces);
    },
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** GET `/api/workspace/workspaces/:id` — fetch a single workspace. */
export function useWorkspace(id: string | null) {
  return useQuery({
    queryKey: workspaceKeys.detail(id),
    queryFn: () =>
      apiRequest<{ workspace: Workspace }>(
        "GET",
        `/api/workspace/workspaces/${id}`,
      ).then((r) => r.workspace),
    enabled: !!id,
  });
}

/** POST `/api/workspace/workspaces` — create a workspace. */
export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) =>
      apiRequest<{ workspace: Workspace }>(
        "POST",
        "/api/workspace/workspaces",
        input,
      ).then((r) => r.workspace),
    onSuccess: (workspace) => {
      qc.setQueryData(workspaceKeys.detail(workspace.id), { workspace });
      qc.invalidateQueries({ queryKey: ["workspace", "list"] });
    },
  });
}

/** PATCH `/api/workspace/workspaces/:id` — update a workspace. */
export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateWorkspaceInput;
    }) =>
      apiRequest<{ workspace: Workspace }>(
        "PATCH",
        `/api/workspace/workspaces/${id}`,
        input,
      ).then((r) => r.workspace),
    onSuccess: (workspace) => {
      qc.setQueryData(workspaceKeys.detail(workspace.id), { workspace });
      qc.invalidateQueries({ queryKey: ["workspace", "list"] });
      qc.invalidateQueries({ queryKey: workspaceKeys.dashboard(workspace.id) });
    },
  });
}

/** DELETE `/api/workspace/workspaces/:id` — hard-delete a workspace. */
export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/workspace/workspaces/${id}`,
      ),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: workspaceKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ["workspace", "list"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** GET `/api/workspace/workspaces/:id/dashboard` — aggregate counts + recents. */
export function useWorkspaceDashboard(id: string | null) {
  return useQuery({
    queryKey: workspaceKeys.dashboard(id),
    queryFn: () =>
      apiRequest<{ dashboard: WorkspaceDashboard }>(
        "GET",
        `/api/workspace/workspaces/${id}/dashboard`,
      ).then((r) => r.dashboard),
    enabled: !!id,
    staleTime: 15 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** GET `/api/workspace/workspaces/:id/members` — list members. */
export function useWorkspaceMembers(workspaceId: string | null) {
  return useQuery({
    queryKey: workspaceKeys.members(workspaceId),
    queryFn: () =>
      apiRequest<{ members: WorkspaceMember[] }>(
        "GET",
        `/api/workspace/workspaces/${workspaceId}/members`,
      ).then((r) => r.members),
    enabled: !!workspaceId,
  });
}

/** POST `/api/workspace/workspaces/:id/members` — invite a member. */
export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: InviteMemberInput;
    }) =>
      apiRequest<{ invitation: WorkspaceInvitation }>(
        "POST",
        `/api/workspace/workspaces/${workspaceId}/members`,
        input,
      ).then((r) => r.invitation),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.members(vars.workspaceId) });
    },
  });
}

/** PATCH `/api/workspace/workspaces/:id/members/:memberId` — update role/status. */
export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      memberId,
      input,
    }: {
      workspaceId: string;
      memberId: string;
      input: UpdateMemberInput;
    }) =>
      apiRequest<{ member: WorkspaceMember }>(
        "PATCH",
        `/api/workspace/workspaces/${workspaceId}/members/${memberId}`,
        input,
      ).then((r) => r.member),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.members(vars.workspaceId) });
    },
  });
}

/** DELETE `/api/workspace/workspaces/:id/members/:memberId` — remove member. */
export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      memberId,
    }: {
      workspaceId: string;
      memberId: string;
    }) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/workspace/workspaces/${workspaceId}/members/${memberId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.members(vars.workspaceId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/** GET `/api/workspace/workspaces/:id/folders` — list folders. */
export function useFolders(workspaceId: string | null) {
  return useQuery({
    queryKey: workspaceKeys.folders(workspaceId),
    queryFn: () =>
      apiRequest<{ folders: Folder[] }>(
        "GET",
        `/api/workspace/workspaces/${workspaceId}/folders`,
      ).then((r) => r.folders),
    enabled: !!workspaceId,
  });
}

/** POST `/api/workspace/workspaces/:id/folders` — create a folder. */
export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: CreateFolderInput;
    }) =>
      apiRequest<{ folder: Folder }>(
        "POST",
        `/api/workspace/workspaces/${workspaceId}/folders`,
        input,
      ).then((r) => r.folder),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.folders(vars.workspaceId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** GET `/api/workspace/workspaces/:id/documents` — list documents. */
export function useDocuments(
  workspaceId: string | null,
  opts: {
    folderId?: string | null;
    search?: string;
    status?: string;
  } = {},
) {
  return useQuery({
    queryKey: workspaceKeys.documents(workspaceId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.folderId !== undefined && opts.folderId !== null) {
        p.set("folderId", opts.folderId);
      }
      if (opts.search) p.set("search", opts.search);
      if (opts.status) p.set("status", opts.status);
      const qs = p.toString();
      return apiRequest<{ documents: Document[] }>(
        "GET",
        `/api/workspace/workspaces/${workspaceId}/documents${qs ? `?${qs}` : ""}`,
      ).then((r) => r.documents);
    },
    enabled: !!workspaceId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** GET `/api/workspace/workspaces/:id/documents/:docId` — fetch one document. */
export function useDocument(workspaceId: string | null, docId: string | null) {
  return useQuery({
    queryKey: workspaceKeys.document(docId),
    queryFn: () =>
      apiRequest<{ document: Document }>(
        "GET",
        `/api/workspace/workspaces/${workspaceId}/documents/${docId}`,
      ).then((r) => r.document),
    enabled: !!workspaceId && !!docId,
  });
}

/** POST `/api/workspace/workspaces/:id/documents` — create a document. */
export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: CreateDocumentInput;
    }) =>
      apiRequest<{ document: Document }>(
        "POST",
        `/api/workspace/workspaces/${workspaceId}/documents`,
        input,
      ).then((r) => r.document),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["workspace", "documents", vars.workspaceId],
      });
      qc.invalidateQueries({
        queryKey: workspaceKeys.dashboard(vars.workspaceId),
      });
    },
  });
}

/** PATCH `/api/workspace/workspaces/:id/documents/:docId` — update a document. */
export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      docId,
      input,
    }: {
      workspaceId: string;
      docId: string;
      input: UpdateDocumentInput;
    }) =>
      apiRequest<{ document: Document }>(
        "PATCH",
        `/api/workspace/workspaces/${workspaceId}/documents/${docId}`,
        input,
      ).then((r) => r.document),
    onSuccess: (document, vars) => {
      qc.setQueryData(workspaceKeys.document(document.id), { document });
      qc.invalidateQueries({
        queryKey: ["workspace", "documents", vars.workspaceId],
      });
      qc.invalidateQueries({
        queryKey: workspaceKeys.versions(document.id),
      });
    },
  });
}

/** DELETE `/api/workspace/workspaces/:id/documents/:docId` — delete a document. */
export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      docId,
    }: {
      workspaceId: string;
      docId: string;
    }) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/workspace/workspaces/${workspaceId}/documents/${docId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.removeQueries({ queryKey: workspaceKeys.document(vars.docId) });
      qc.invalidateQueries({
        queryKey: ["workspace", "documents", vars.workspaceId],
      });
      qc.invalidateQueries({
        queryKey: workspaceKeys.dashboard(vars.workspaceId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Document versions
// ---------------------------------------------------------------------------

/** GET `/api/workspace/workspaces/:id/documents/:docId/versions` — history. */
export function useDocumentVersions(
  workspaceId: string | null,
  docId: string | null,
) {
  return useQuery({
    queryKey: workspaceKeys.versions(docId),
    queryFn: () =>
      apiRequest<{ versions: DocumentVersion[] }>(
        "GET",
        `/api/workspace/workspaces/${workspaceId}/documents/${docId}/versions`,
      ).then((r) => r.versions),
    enabled: !!workspaceId && !!docId,
  });
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

/** GET `/api/workspace/workspaces/:id/knowledge` — list articles. */
export function useKnowledge(
  workspaceId: string | null,
  opts: { search?: string; tag?: string; sourceType?: string } = {},
) {
  return useQuery({
    queryKey: workspaceKeys.knowledge(workspaceId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.search) p.set("search", opts.search);
      if (opts.tag) p.set("tag", opts.tag);
      if (opts.sourceType) p.set("sourceType", opts.sourceType);
      const qs = p.toString();
      return apiRequest<{ articles: KnowledgeArticle[] }>(
        "GET",
        `/api/workspace/workspaces/${workspaceId}/knowledge${qs ? `?${qs}` : ""}`,
      ).then((r) => r.articles);
    },
    enabled: !!workspaceId,
  });
}

/** POST `/api/workspace/workspaces/:id/knowledge` — create an article. */
export function useCreateKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: CreateKnowledgeArticleInput;
    }) =>
      apiRequest<{ article: KnowledgeArticle }>(
        "POST",
        `/api/workspace/workspaces/${workspaceId}/knowledge`,
        input,
      ).then((r) => r.article),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["workspace", "knowledge", vars.workspaceId],
      });
      qc.invalidateQueries({
        queryKey: workspaceKeys.dashboard(vars.workspaceId),
      });
    },
  });
}

/** PATCH `/api/workspace/workspaces/:id/knowledge/:id` — update an article. */
export function useUpdateKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      articleId,
      input,
    }: {
      workspaceId: string;
      articleId: string;
      input: UpdateKnowledgeArticleInput;
    }) =>
      apiRequest<{ article: KnowledgeArticle }>(
        "PATCH",
        `/api/workspace/workspaces/${workspaceId}/knowledge/${articleId}`,
        input,
      ).then((r) => r.article),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["workspace", "knowledge", vars.workspaceId],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/** GET `/api/workspace/workspaces/:id/activity` — activity feed. */
export function useWorkspaceActivity(workspaceId: string | null) {
  return useQuery({
    queryKey: workspaceKeys.activity(workspaceId),
    queryFn: () =>
      apiRequest<{ activity: WorkspaceActivity[] }>(
        "GET",
        `/api/workspace/workspaces/${workspaceId}/activity`,
      ).then((r) => r.activity),
    enabled: !!workspaceId,
    staleTime: 10 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** GET `/api/workspace/comments?workspaceId=...` — list comments. */
export function useComments(
  workspaceId: string | null,
  opts: { documentId?: string; resolved?: boolean } = {},
) {
  return useQuery({
    queryKey: workspaceKeys.comments(workspaceId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (workspaceId) p.set("workspaceId", workspaceId);
      if (opts.documentId) p.set("documentId", opts.documentId);
      if (opts.resolved !== undefined) p.set("resolved", String(opts.resolved));
      return apiRequest<{ comments: Comment[] }>(
        "GET",
        `/api/workspace/comments?${p.toString()}`,
      ).then((r) => r.comments);
    },
    enabled: !!workspaceId,
  });
}

/** POST `/api/workspace/comments` — create a comment. */
export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      apiRequest<{ comment: Comment }>(
        "POST",
        "/api/workspace/comments",
        input,
      ).then((r) => r.comment),
    onSuccess: (comment) => {
      qc.invalidateQueries({
        queryKey: ["workspace", "comments", comment.workspace_id],
      });
    },
  });
}

/** PATCH `/api/workspace/comments/:id` — resolve / edit. */
export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      commentId,
      input,
    }: {
      workspaceId: string;
      commentId: string;
      input: UpdateCommentInput;
    }) =>
      apiRequest<{ comment: Comment }>(
        "PATCH",
        `/api/workspace/comments/${commentId}`,
        { workspaceId, ...input },
      ).then((r) => r.comment),
    onSuccess: (comment) => {
      qc.invalidateQueries({
        queryKey: ["workspace", "comments", comment.workspace_id],
      });
    },
  });
}

/** DELETE `/api/workspace/comments/:id` — delete. */
export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      commentId,
    }: {
      workspaceId: string;
      commentId: string;
    }) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/workspace/comments/${commentId}?workspaceId=${workspaceId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["workspace", "comments", vars.workspaceId],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** GET `/api/workspace/search?q=...&workspaceId=...` — global search. */
export function useWorkspaceSearch(
  workspaceId: string | null,
  opts: WorkspaceSearchOptions,
) {
  return useQuery({
    queryKey: [
      "workspace",
      "search",
      workspaceId,
      opts.query,
      opts.kinds ?? null,
      opts.limit ?? 10,
    ] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("workspaceId", workspaceId ?? "");
      p.set("q", opts.query);
      for (const k of opts.kinds ?? []) p.append("kinds", k);
      if (opts.limit) p.set("limit", String(opts.limit));
      return apiRequest<{ results: WorkspaceSearchResult }>(
        "GET",
        `/api/workspace/search?${p.toString()}`,
      ).then((r) => r.results);
    },
    enabled: !!workspaceId && opts.query.trim().length > 0,
    staleTime: 30 * 1000,
  });
}
