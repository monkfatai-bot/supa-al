"use client";

/**
 * Supa AI — Chat data hooks (Phase 3).
 *
 * TanStack Query wrappers for every `/api/chat/*` REST endpoint the chat
 * UI consumes. Each hook returns the standard TanStack Query result;
 * mutations invalidate the relevant query keys so the UI stays in sync
 * after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code? }` shape via {@link unwrapChatApiError}.
 *
 * The hooks are deliberately thin — they own no UI state. The streaming
 * state (isGenerating / partialMessage) lives in {@link useChatStream};
 * the cross-component UI state (active conversation, selected model)
 * lives in {@link useChatStore} (Zustand).
 *
 * @module @/hooks/use-chat
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type { AIProvider } from "@/lib/ai/types";
import type { Conversation } from "@/lib/chat/conversation-service";
import type { CreateConversationInput } from "@/lib/validation/chat";
import type { Message } from "@/lib/chat/message-service";
import type { Tables } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types mirroring the API response shapes
// ---------------------------------------------------------------------------

/** `conversation_folders` row. */
export type Folder = Tables<"conversation_folders">;
/** `prompt_templates` row. */
export type PromptTemplate = Tables<"prompt_templates">;
/** `files` row. */
export type UploadedFile = Tables<"files">;

/** Options accepted by `useConversations`. */
export interface UseConversationsOptions {
  archived?: boolean;
  folderId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Body accepted by the streaming send endpoint. */
export interface SendMessageInput {
  content: string;
  provider?: AIProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  attachmentIds?: string[];
}

/** Body accepted by the regenerate endpoint. */
export interface RegenerateInput {
  provider?: AIProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Body accepted by PATCH `/api/chat/conversations/:id`. */
export interface UpdateConversationInput {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  /** `null` moves the conversation out of its folder. */
  folderId?: string | null;
}

/** Body accepted by the message-edit endpoint. */
export interface EditMessageInput {
  content: string;
}

/** Shape returned by GET `/api/chat/models`. */
export interface ModelsResponse {
  groups: Array<{
    provider: AIProvider;
    label: string;
    models: Array<{
      id: string;
      label: string;
      contextWindow: number;
      maxOutputTokens: number;
      inputCostCentsPer1K: number;
      outputCostCentsPer1K: number;
      capabilities: {
        chat: boolean;
        streaming: boolean;
        tools: boolean;
        vision: boolean;
        json_mode: boolean;
      };
      tier: "free" | "starter" | "pro" | "business" | "enterprise";
      description: string;
    }>;
  }>;
  availableProviders: AIProvider[];
  defaultProvider: AIProvider;
  defaultModel: string;
}

/** Shape returned by GET `/api/chat/usage`. */
export interface ChatUsageResponse {
  totalTokens: number;
  totalCostCents: number;
  requestCount: number;
  period: { start: string; end: string };
}

/** Shape returned by POST `/api/chat/templates/:id/use`. */
export interface TemplateUseResponse {
  template: PromptTemplate;
  rendered: string;
  variables: {
    declared: string[];
    used: string[];
    missingFromCaller: string[];
  };
}

/** Shape returned by GET `/api/chat/files/:id/context`. */
export interface FileContextResponse {
  content: string;
  extracted: boolean;
  filename: string;
  mimeType: string;
  mimeTypeLabel: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const chatKeys = {
  all: ["chat"] as const,
  conversations: (opts?: UseConversationsOptions) =>
    [
      "chat",
      "conversations",
      opts?.archived ?? false,
      opts?.folderId ?? null,
      opts?.search ?? "",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  conversation: (id: string | null) =>
    ["chat", "conversation", id ?? null] as const,
  messages: (conversationId: string | null) =>
    ["chat", "messages", conversationId ?? null] as const,
  folders: ["chat", "folders"] as const,
  models: ["chat", "models"] as const,
  templates: (opts?: {
    category?: string;
    favorites?: boolean;
    search?: string;
  }) =>
    [
      "chat",
      "templates",
      opts?.category ?? null,
      opts?.favorites ?? false,
      opts?.search ?? "",
    ] as const,
  usage: ["chat", "usage"] as const,
  files: (conversationId?: string) =>
    ["chat", "files", conversationId ?? null] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface ChatApiError {
  message: string;
  code?: string;
  /** Status code (for branching on 402 / 429 etc.). */
  status?: number;
}

async function unwrapChatApiError(res: Response): Promise<ChatApiError> {
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    return {
      message: `Request failed (${res.status}).`,
      status: res.status,
    };
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
 * throw a {@link ChatApiError}. Both network failures and non-2xx
 * responses throw — callers decide what's an error.
 */
export async function chatApiRequest<T>(
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  };
  const res = await fetch(url, init);
  if (!res.ok) {
    throw await unwrapChatApiError(res);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw {
      message: json.error?.message ?? "Unexpected response shape.",
      code: json.error?.code,
    } as ChatApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

function buildConversationsQuery(opts: UseConversationsOptions): string {
  const p = new URLSearchParams();
  if (opts.archived) p.set("archived", "true");
  if (opts.folderId) p.set("folderId", opts.folderId);
  if (opts.search) p.set("search", opts.search);
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.offset) p.set("offset", String(opts.offset));
  return p.toString();
}

/** GET `/api/chat/conversations` — paginated list of the caller's conversations. */
export function useConversations(opts: UseConversationsOptions = {}) {
  return useQuery({
    queryKey: chatKeys.conversations(opts),
    queryFn: () =>
      chatApiRequest<{ conversations: Conversation[] }>(
        "GET",
        `/api/chat/conversations?${buildConversationsQuery(opts)}`,
      ).then((r) => r.conversations),
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** GET `/api/chat/conversations/:id` — fetch a single conversation. */
export function useConversation(id: string | null) {
  return useQuery({
    queryKey: chatKeys.conversation(id),
    queryFn: () =>
      chatApiRequest<{ conversation: Conversation }>(
        "GET",
        `/api/chat/conversations/${id}`,
      ).then((r) => r.conversation),
    enabled: !!id,
  });
}

/** POST `/api/chat/conversations` — create a new conversation. */
export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      chatApiRequest<{ conversation: Conversation }>(
        "POST",
        "/api/chat/conversations",
        input,
      ).then((r) => r.conversation),
    onSuccess: (conversation) => {
      // Pre-populate the cache for the single-conversation query so the
      // chat window doesn't re-fetch immediately after creation.
      qc.setQueryData(chatKeys.conversation(conversation.id), {
        conversation,
      });
      qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      qc.invalidateQueries({ queryKey: chatKeys.usage });
    },
  });
}

/** PATCH `/api/chat/conversations/:id` — rename / pin / archive / move. */
export function useUpdateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateConversationInput;
    }) =>
      chatApiRequest<{ conversation: Conversation }>(
        "PATCH",
        `/api/chat/conversations/${id}`,
        input,
      ).then((r) => r.conversation),
    onSuccess: (conversation) => {
      qc.setQueryData(chatKeys.conversation(conversation.id), {
        conversation,
      });
      qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
  });
}

/** DELETE `/api/chat/conversations/:id` — hard-delete (cascades messages). */
export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      chatApiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/chat/conversations/${id}`,
      ),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: chatKeys.conversation(id) });
      qc.removeQueries({ queryKey: chatKeys.messages(id) });
      qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Messages (paginated — infinite query)
// ---------------------------------------------------------------------------

/** The page size for the messages infinite query. */
const MESSAGES_PAGE_SIZE = 50;

/**
 * GET `/api/chat/conversations/:id/messages` — paginated messages via
 * an infinite query. Pages are loaded by `offset`; the infinite query
 * returns `{ pages: Message[][], pageParams: number[] }` after flattening.
 *
 * The UI flattens the pages into a single message list (oldest first)
 * via {@link flattenMessagePages}.
 */
export function useMessages(conversationId: string | null) {
  return useInfiniteQuery<
    Message[],
    Error,
    InfiniteData<Message[], number>,
    readonly unknown[],
    number
  >({
    queryKey: chatKeys.messages(conversationId),
    queryFn: ({ pageParam }) =>
      chatApiRequest<{ messages: Message[] }>(
        "GET",
        `/api/chat/conversations/${conversationId}/messages?limit=${MESSAGES_PAGE_SIZE}&offset=${pageParam}`,
      ).then((r) => r.messages),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      // If the page was full, assume there might be more.
      if (lastPage.length < MESSAGES_PAGE_SIZE) return undefined;
      return lastPageParam + MESSAGES_PAGE_SIZE;
    },
    enabled: !!conversationId,
    staleTime: 5 * 1000,
  });
}

/** Flatten an infinite-query data structure into a single message array. */
export function flattenMessagePages(
  data: InfiniteData<Message[], number> | undefined,
): Message[] {
  if (!data) return [];
  const out: Message[] = [];
  for (const page of data.pages) {
    for (const m of page) {
      out.push(m);
    }
  }
  return out;
}

/** PATCH `/api/chat/messages/:id` — edit a user-role message's content. */
export function useEditMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: EditMessageInput;
    }) =>
      chatApiRequest<{ message: Message }>(
        "PATCH",
        `/api/chat/messages/${id}`,
        input,
      ).then((r) => r.message),
    onSuccess: (message) => {
      // Optimistically patch the cached messages list.
      const key = chatKeys.messages(conversationId);
      const cached = qc.getQueryData<InfiniteData<Message[], number>>(key);
      if (cached) {
        const next: InfiniteData<Message[], number> = {
          ...cached,
          pages: cached.pages.map((page) =>
            page.map((m) => (m.id === message.id ? message : m)),
          ),
        };
        qc.setQueryData(key, next);
      }
    },
  });
}

/** DELETE `/api/chat/messages/:id` — hard-delete a message. */
export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      chatApiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/chat/messages/${id}`,
      ),
    onSuccess: (_data, id) => {
      const key = chatKeys.messages(conversationId);
      const cached = qc.getQueryData<InfiniteData<Message[], number>>(key);
      if (cached) {
        const next: InfiniteData<Message[], number> = {
          ...cached,
          pages: cached.pages.map((page) =>
            page.filter((m) => m.id !== id),
          ),
        };
        qc.setQueryData(key, next);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Models + usage
// ---------------------------------------------------------------------------

/** GET `/api/chat/models` — model catalog grouped by provider. */
export function useModels() {
  return useQuery({
    queryKey: chatKeys.models,
    queryFn: () => chatApiRequest<ModelsResponse>("GET", "/api/chat/models"),
    staleTime: 5 * 60 * 1000,
  });
}

/** GET `/api/chat/usage` — current-month usage summary. */
export function useChatUsage() {
  return useQuery({
    queryKey: chatKeys.usage,
    queryFn: () =>
      chatApiRequest<ChatUsageResponse>("GET", "/api/chat/usage"),
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/** GET `/api/chat/folders` — list the caller's folders. */
export function useFolders() {
  return useQuery({
    queryKey: chatKeys.folders,
    queryFn: () =>
      chatApiRequest<{ folders: Folder[] }>(
        "GET",
        "/api/chat/folders",
      ).then((r) => r.folders),
    staleTime: 30 * 1000,
  });
}

/** POST `/api/chat/folders` — create a new folder. */
export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string }) =>
      chatApiRequest<{ folder: Folder }>(
        "POST",
        "/api/chat/folders",
        input,
      ).then((r) => r.folder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.folders });
    },
  });
}

/** PATCH `/api/chat/folders/:id` — rename / recolor a folder. */
export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; color?: string };
    }) =>
      chatApiRequest<{ folder: Folder }>(
        "PATCH",
        `/api/chat/folders/${id}`,
        input,
      ).then((r) => r.folder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.folders });
    },
  });
}

/** DELETE `/api/chat/folders/:id` — delete a folder (conversations get
 * `folder_id = null`). */
export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      chatApiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/chat/folders/${id}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.folders });
      // Conversations list also changes (their folder_id was nullified).
      qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

/** Options accepted by `usePromptTemplates`. */
export interface UsePromptTemplatesOptions {
  category?: string;
  favorites?: boolean;
  search?: string;
}

/** GET `/api/chat/templates` — list templates visible to the caller. */
export function usePromptTemplates(opts: UsePromptTemplatesOptions = {}) {
  return useQuery({
    queryKey: chatKeys.templates(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.category) p.set("category", opts.category);
      if (opts.favorites) p.set("favorites", "true");
      if (opts.search) p.set("search", opts.search);
      const qs = p.toString();
      return chatApiRequest<PromptTemplate[]>(
        "GET",
        `/api/chat/templates${qs ? `?${qs}` : ""}`,
      );
    },
    staleTime: 30 * 1000,
  });
}

/** POST `/api/chat/templates` — create a new user-owned template. */
export function useCreatePromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      category: string;
      content: string;
      variables?: Array<{
        name: string;
        description?: string;
        defaultValue?: string;
      }>;
      isFavorite?: boolean;
    }) =>
      chatApiRequest<PromptTemplate>("POST", "/api/chat/templates", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "templates"] });
    },
  });
}

/** PATCH `/api/chat/templates/:id` — partial-update a template. */
export function useUpdatePromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        title?: string;
        description?: string;
        category?: string;
        content?: string;
        variables?: Array<{
          name: string;
          description?: string;
          defaultValue?: string;
        }>;
        isFavorite?: boolean;
      };
    }) =>
      chatApiRequest<PromptTemplate>(
        "PATCH",
        `/api/chat/templates/${id}`,
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "templates"] });
    },
  });
}

/** DELETE `/api/chat/templates/:id` — delete a user-owned template. */
export function useDeletePromptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      chatApiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/chat/templates/${id}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "templates"] });
    },
  });
}

/** POST `/api/chat/templates/:id/favorite` — toggle favorite. */
export function useToggleFavoriteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      chatApiRequest<PromptTemplate>(
        "POST",
        `/api/chat/templates/${id}/favorite`,
        { favorite },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "templates"] });
    },
  });
}

/** POST `/api/chat/templates/:id/use` — render the template + bump usage. */
export function useRenderTemplate() {
  return useMutation({
    mutationFn: ({
      id,
      variables,
    }: {
      id: string;
      variables: Record<string, string>;
    }) =>
      chatApiRequest<TemplateUseResponse>(
        "POST",
        `/api/chat/templates/${id}/use`,
        { variables },
      ),
  });
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** POST `/api/chat/files` (multipart) — upload a chat file. */
export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<UploadedFile> => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/chat/files", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await unwrapChatApiError(res);
        throw err;
      }
      const json = (await res.json()) as ApiResponse<UploadedFile>;
      if (!json.success) {
        throw {
          message: json.error?.message ?? "Upload failed.",
          code: json.error?.code,
        } as ChatApiError;
      }
      return json.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "files"] });
    },
  });
}

/** GET `/api/chat/files` — list the caller's uploaded files. */
export function useFiles(conversationId?: string) {
  return useQuery({
    queryKey: chatKeys.files(conversationId),
    queryFn: () => {
      const p = new URLSearchParams();
      if (conversationId) p.set("conversationId", conversationId);
      return chatApiRequest<UploadedFile[]>(
        "GET",
        `/api/chat/files${p.toString() ? `?${p}` : ""}`,
      );
    },
    staleTime: 30 * 1000,
  });
}

/** GET `/api/chat/files/:id/context` — extract text content. */
export function useFileContext(fileId: string | null) {
  return useQuery({
    queryKey: ["chat", "file-context", fileId],
    queryFn: () =>
      chatApiRequest<FileContextResponse>(
        "GET",
        `/api/chat/files/${fileId}/context`,
      ),
    enabled: !!fileId,
    staleTime: 5 * 60 * 1000,
  });
}
