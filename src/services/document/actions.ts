"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";
import { logActivity } from "@/services/activity-log/actions";
import { PAGINATION } from "@/config/constants";
import { env } from "@/config/env";
import type { ActivityAction, Document, DocumentVersion } from "@/types/generated/database";
import type {
  DocumentActionResponse,
  GetDocumentResponse,
  DocumentWithCreator,
  DocumentVersionWithCreator,
  DocumentListOptions,
  AiAssistantAction,
  AiAssistantResponse,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verify the user is a member of the given workspace.
 * Returns the membership row or null.
 */
/**
 * Enrich a single document row with creator profile info.
 */
function enrichDocument(
  doc: Document,
  profileMap: Record<string, { full_name: string | null; avatar_url: string | null }>,
): DocumentWithCreator {
  const profile = profileMap[doc.created_by] ?? {};
  return {
    ...doc,
    creator_name: profile.full_name ?? null,
    creator_avatar: profile.avatar_url ?? null,
  };
}

/**
 * Enrich a version row with creator profile info.
 */
function enrichVersion(
  version: DocumentVersion,
  profileMap: Record<string, { full_name: string | null; avatar_url: string | null }>,
): DocumentVersionWithCreator {
  const profile = profileMap[version.created_by] ?? {};
  return {
    ...version,
    creator_name: profile.full_name ?? null,
    creator_avatar: profile.avatar_url ?? null,
  };
}

/**
 * Count words in text.
 */
function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Build a profile map from a list of profile rows.
 */
function buildProfileMap(
  profiles: Array<{ id: string; full_name: string | null; avatar_url: string | null }>,
): Record<string, { full_name: string | null; avatar_url: string | null }> {
  const map: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
  for (const p of profiles) {
    map[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
  }
  return map;
}

// ── AI Assistant prompts ─────────────────────────────────────────────────────

function buildAiPrompt(action: AiAssistantAction, text: string, language?: string, context?: string): string {
  const contextBlock = context ? `\n\nContext: ${context}` : "";

  switch (action) {
    case "rewrite":
      return `Rewrite the following text to improve clarity, flow, and readability while preserving the original meaning. Keep the same tone.${contextBlock}\n\nText:\n${text}`;
    case "expand":
      return `Expand the following text with more detail, examples, and elaboration while maintaining the same style and tone.${contextBlock}\n\nText:\n${text}`;
    case "summarize":
      return `Provide a concise summary of the following text. Capture the key points and main ideas.${contextBlock}\n\nText:\n${text}`;
    case "translate":
      return `Translate the following text into ${language ?? "English"}. Preserve formatting, tone, and meaning.${contextBlock}\n\nText:\n${text}`;
    case "improve_grammar":
      return `Improve the grammar, spelling, and punctuation of the following text. Fix errors while preserving the original meaning and style.${contextBlock}\n\nText:\n${text}`;
    case "generate_title":
      return `Generate 3 concise, engaging title suggestions for the following content. Return only the titles, one per line.${contextBlock}\n\nContent:\n${text}`;
    case "create_outline":
      return `Create a detailed outline for a document based on the following content or topic. Use a hierarchical structure with headings and subheadings.${contextBlock}\n\nContent/Topic:\n${text}`;
    case "continue_writing":
      return `Continue writing the following text naturally, maintaining the same style, tone, and direction. Write 1-2 paragraphs.${contextBlock}\n\nText:\n${text}`;
    case "explain":
      return `Explain the following text in simple, clear terms. Make it easy to understand for a general audience.${contextBlock}\n\nText:\n${text}`;
    case "generate_table":
      return `Generate a Markdown table based on the following information. Include appropriate headers and rows.${contextBlock}\n\nInformation:\n${text}`;
    case "generate_code":
      return `Generate code based on the following description or requirements. Use best practices and include comments where helpful.${contextBlock}\n\nDescription:\n${text}`;
    default:
      return text;
  }
}

// ── Server actions ──────────────────────────────────────────────────────────

/**
 * Get a paginated list of documents for a workspace.
 */
export async function getDocuments(
  options: DocumentListOptions,
): Promise<DocumentActionResponse & { documents?: DocumentWithCreator[]; total?: number }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { filters, page = 1, page_size = PAGINATION.DEFAULT_PAGE_SIZE } = options;
  const pageSize = Math.min(page_size, PAGINATION.MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  // Verify workspace membership
  if (filters.workspace_id) {
    try { await verifyWorkspaceMembership(filters.workspace_id, profile.id); } catch {
      return { success: false, message: "Access denied.", error: "FORBIDDEN" };
    }
  }

  // Build query
  let query = supabase
    .from("documents")
    .select("*", { count: "exact" })
    .eq("status", filters.status ?? "draft");

  if (filters.workspace_id) query = query.eq("workspace_id", filters.workspace_id);
  if (filters.folder_id !== undefined) query = query.eq("folder_id", filters.folder_id);
  if (filters.document_type) query = query.eq("document_type", filters.document_type);
  if (filters.is_favorite !== undefined) query = query.eq("is_favorite", filters.is_favorite);
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains("tags", filters.tags);
  }
  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
  }

  const sortBy = filters.sort_by ?? "updated_at";
  const sortOrder = filters.sort_order ?? "desc";
  query = query.order(sortBy, { ascending: sortOrder === "asc" });
  query = query.range(offset, offset + pageSize - 1);

  const { data: documents, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch documents", { reason: error.message });
    return { success: false, message: "Failed to fetch documents.", error: "FETCH_FAILED" };
  }

  // Batch-fetch creator profiles
  const creatorIds = [...new Set((documents ?? []).map((d) => d.created_by))];
  const { data: profiles } = creatorIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", creatorIds)
    : { data: [] };

  const profileMap = buildProfileMap(profiles ?? []);
  const enriched = (documents ?? []).map((d) => enrichDocument(d, profileMap));

  return { success: true, message: "Documents retrieved.", documents: enriched, total: count ?? 0 };
}

/**
 * Get a single document by ID.
 */
export async function getDocument(id: string): Promise<GetDocumentResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: document, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !document) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  // Verify workspace membership
  try { await verifyWorkspaceMembership(document.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch creator profile
  const { data: creatorProfile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", document.created_by)
    .single();

  const enriched: DocumentWithCreator = {
    ...document,
    creator_name: creatorProfile?.full_name ?? null,
    creator_avatar: creatorProfile?.avatar_url ?? null,
  };

  return { success: true, message: "Document retrieved.", document: enriched };
}

/**
 * Create a new document.
 */
export async function createDocument(
  workspaceId: string,
  title?: string,
  content?: string,
  documentType?: string,
  folderId?: string,
): Promise<DocumentActionResponse & { document?: DocumentWithCreator }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify workspace membership
  let membership;
  try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Guests cannot create
  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot create documents.", error: "FORBIDDEN" };
  }

  const trimmedTitle = title?.trim() ?? "Untitled Document";
  const trimmedContent = content ?? "";
  const wordCount = countWords(trimmedContent);
  const charCount = trimmedContent.length;

  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      title: trimmedTitle,
      content: trimmedContent,
      document_type: documentType ?? "rich_text",
      folder_id: folderId ?? null,
      status: "draft",
      version_number: 1,
      word_count: wordCount,
      character_count: charCount,
      cover_image_url: "",
      tags: [],
      is_favorite: false,
      is_pinned: false,
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !document) {
    logger.error("Failed to create document", { workspaceId, reason: error?.message });
    return { success: false, message: "Failed to create document.", error: "CREATE_FAILED" };
  }

  logger.info("Document created", { documentId: document.id, workspaceId });
  await logActivity(
    "document_created" as ActivityAction,
    `Created document: ${trimmedTitle}`,
    { documentId: document.id, documentType },
    workspaceId,
  );

  const enriched: DocumentWithCreator = {
    ...document,
    creator_name: null,
    creator_avatar: null,
  };

  return { success: true, message: "Document created.", document: enriched };
}

/**
 * Update a document.
 */
export async function updateDocument(
  id: string,
  updates: {
    title?: string;
    content?: string;
    folder_id?: string | null;
    document_type?: string;
    tags?: string[];
    is_favorite?: boolean;
    is_pinned?: boolean;
    status?: string;
    cover_image_url?: string;
  },
): Promise<DocumentActionResponse & { document?: DocumentWithCreator }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch existing document
  const { data: existing, error: fetchError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  // Verify membership
  let membership;
  try { membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Guests cannot update
  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot update documents.", error: "FORBIDDEN" };
  }

  // Build update payload
  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_edited_by: profile.id,
    last_edited_at: new Date().toISOString(),
  };

  if (updates.title !== undefined) dbUpdates.title = updates.title.trim();
  if (updates.content !== undefined) {
    dbUpdates.content = updates.content;
    dbUpdates.word_count = countWords(updates.content);
    dbUpdates.character_count = updates.content.length;
  }
  if (updates.folder_id !== undefined) dbUpdates.folder_id = updates.folder_id;
  if (updates.document_type !== undefined) dbUpdates.document_type = updates.document_type;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.is_favorite !== undefined) dbUpdates.is_favorite = updates.is_favorite;
  if (updates.is_pinned !== undefined) dbUpdates.is_pinned = updates.is_pinned;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.cover_image_url !== undefined) dbUpdates.cover_image_url = updates.cover_image_url;

  const { data: document, error } = await supabase
    .from("documents")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error || !document) {
    logger.error("Failed to update document", { documentId: id, reason: error?.message });
    return { success: false, message: "Failed to update document.", error: "UPDATE_FAILED" };
  }

  logger.info("Document updated", { documentId: id });
  await logActivity(
    "document_updated" as ActivityAction,
    `Updated document: ${document.title}`,
    { documentId: id },
    existing.workspace_id,
  );

  const enriched: DocumentWithCreator = {
    ...document,
    creator_name: null,
    creator_avatar: null,
  };

  return { success: true, message: "Document updated.", document: enriched };
}

/**
 * Delete a document (soft delete).
 */
export async function deleteDocument(id: string): Promise<DocumentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("documents")
    .select("id, workspace_id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  let membership;
  try { membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot delete documents.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("documents")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    logger.error("Failed to delete document", { documentId: id, reason: error.message });
    return { success: false, message: "Failed to delete document.", error: "DELETE_FAILED" };
  }

  logger.info("Document deleted", { documentId: id });
  await logActivity(
    "document_deleted" as ActivityAction,
    `Deleted document: ${existing.title}`,
    { documentId: id },
    existing.workspace_id,
  );
  revalidatePath("/dashboard");
  return { success: true, message: "Document deleted." };
}

/**
 * Archive a document.
 */
export async function archiveDocument(id: string): Promise<DocumentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("documents")
    .select("id, workspace_id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("documents")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    logger.error("Failed to archive document", { documentId: id, reason: error.message });
    return { success: false, message: "Failed to archive document.", error: "UPDATE_FAILED" };
  }

  logger.info("Document archived", { documentId: id });
  await logActivity(
    "document_archived" as ActivityAction,
    `Archived document: ${existing.title}`,
    { documentId: id },
    existing.workspace_id,
  );
  return { success: true, message: "Document archived." };
}

/**
 * Restore a document from archive or trash.
 */
export async function restoreDocument(id: string): Promise<DocumentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("documents")
    .select("id, workspace_id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("documents")
    .update({
      status: "draft",
      archived_at: null,
      deleted_at: null,
    })
    .eq("id", id);

  if (error) {
    logger.error("Failed to restore document", { documentId: id, reason: error.message });
    return { success: false, message: "Failed to restore document.", error: "UPDATE_FAILED" };
  }

  logger.info("Document restored", { documentId: id });
  await logActivity(
    "document_restored" as ActivityAction,
    `Restored document: ${existing.title}`,
    { documentId: id },
    existing.workspace_id,
  );
  return { success: true, message: "Document restored." };
}

/**
 * Duplicate a document.
 */
export async function duplicateDocument(
  id: string,
): Promise<DocumentActionResponse & { document?: DocumentWithCreator }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  let membership;
  try { membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot duplicate documents.", error: "FORBIDDEN" };
  }

  const duplicateTitle = `${existing.title} (Copy)`;

  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      workspace_id: existing.workspace_id,
      folder_id: existing.folder_id,
      title: duplicateTitle,
      content: existing.content,
      document_type: existing.document_type,
      status: "draft",
      version_number: 1,
      word_count: existing.word_count,
      character_count: existing.character_count,
      cover_image_url: existing.cover_image_url,
      tags: [...existing.tags],
      is_favorite: false,
      is_pinned: false,
      settings: existing.settings,
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !document) {
    logger.error("Failed to duplicate document", { documentId: id, reason: error?.message });
    return { success: false, message: "Failed to duplicate document.", error: "CREATE_FAILED" };
  }

  logger.info("Document duplicated", { originalId: id, newId: document.id });
  await logActivity(
    "document_duplicated" as ActivityAction,
    `Duplicated document: ${existing.title}`,
    { originalId: id, newId: document.id },
    existing.workspace_id,
  );

  const enriched: DocumentWithCreator = {
    ...document,
    creator_name: null,
    creator_avatar: null,
  };

  return { success: true, message: "Document duplicated.", document: enriched };
}

/**
 * Publish a document.
 */
export async function publishDocument(id: string): Promise<DocumentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("documents")
    .select("id, workspace_id, title")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  let membership;
  try { membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot publish documents.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("documents")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    logger.error("Failed to publish document", { documentId: id, reason: error.message });
    return { success: false, message: "Failed to publish document.", error: "UPDATE_FAILED" };
  }

  logger.info("Document published", { documentId: id });
  await logActivity(
    "document_updated" as ActivityAction,
    `Published document: ${existing.title}`,
    { documentId: id },
    existing.workspace_id,
  );
  return { success: true, message: "Document published." };
}

/**
 * Toggle the favorite status of a document.
 */
export async function toggleFavorite(id: string): Promise<DocumentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("documents")
    .select("id, workspace_id, title, is_favorite")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("documents")
    .update({ is_favorite: !existing.is_favorite })
    .eq("id", id);

  if (error) {
    logger.error("Failed to toggle favorite", { documentId: id, reason: error.message });
    return { success: false, message: "Failed to toggle favorite.", error: "UPDATE_FAILED" };
  }

  return { success: true, message: existing.is_favorite ? "Removed from favorites." : "Added to favorites." };
}

/**
 * Export a document in the specified format.
 * Returns the document content (or a markdown-converted version) for download.
 */
export async function exportDocument(
  id: string,
  format: "markdown" | "text" | "json",
): Promise<DocumentActionResponse & { content?: string; filename?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: document } = await supabase
    .from("documents")
    .select("id, workspace_id, title, content")
    .eq("id", id)
    .single();

  if (!document) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(document.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  let exportContent: string;
  let filename: string;

  switch (format) {
    case "markdown":
      exportContent = document.content;
      filename = `${document.title}.md`;
      break;
    case "text":
      // Strip basic markdown for plain text
      exportContent = document.content
        .replace(/#{1,6}\s/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .replace(/```[\s\S]*?```/g, "");
      filename = `${document.title}.txt`;
      break;
    case "json":
      exportContent = JSON.stringify(
        { title: document.title, content: document.content, exportedAt: new Date().toISOString() },
        null,
        2,
      );
      filename = `${document.title}.json`;
      break;
    default:
      return { success: false, message: "Unsupported export format.", error: "INVALID_FORMAT" };
  }

  logger.info("Document exported", { documentId: id, format });
  await logActivity(
    "document_exported" as ActivityAction,
    `Exported document: ${document.title} as ${format}`,
    { documentId: id, format },
    document.workspace_id,
  );

  return { success: true, message: "Document exported.", content: exportContent, filename };
}

/**
 * Save a new version of the document.
 */
export async function saveVersion(
  id: string,
  changeSummary?: string,
): Promise<DocumentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  let membership;
  try { membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot save versions.", error: "FORBIDDEN" };
  }

  const newVersionNumber = existing.version_number + 1;

  // Insert version record
  const { error: versionError } = await supabase.from("document_versions").insert({
    document_id: id,
    version_number: newVersionNumber,
    title: existing.title,
    content: existing.content,
    change_summary: changeSummary ?? "",
    word_count: existing.word_count,
    character_count: existing.character_count,
    created_by: profile.id,
  });

  if (versionError) {
    logger.error("Failed to save version", { documentId: id, reason: versionError.message });
    return { success: false, message: "Failed to save version.", error: "CREATE_FAILED" };
  }

  // Update document version number
  await supabase
    .from("documents")
    .update({ version_number: newVersionNumber })
    .eq("id", id);

  logger.info("Version saved", { documentId: id, version: newVersionNumber });
  await logActivity(
    "version_created" as ActivityAction,
    `Saved version ${newVersionNumber} of: ${existing.title}`,
    { documentId: id, version: newVersionNumber },
    existing.workspace_id,
  );

  return { success: true, message: "Version saved." };
}

/**
 * Get the version history for a document.
 */
export async function getVersionHistory(
  documentId: string,
): Promise<DocumentActionResponse & { versions?: DocumentVersionWithCreator[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch the document to get workspace_id
  const { data: document } = await supabase
    .from("documents")
    .select("id, workspace_id")
    .eq("id", documentId)
    .single();

  if (!document) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(document.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: versions, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });

  if (error) {
    logger.error("Failed to fetch version history", { documentId, reason: error.message });
    return { success: false, message: "Failed to fetch version history.", error: "FETCH_FAILED" };
  }

  // Enrich with creator info
  const creatorIds = [...new Set((versions ?? []).map((v) => v.created_by))];
  const { data: profiles } = creatorIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", creatorIds)
    : { data: [] };

  const profileMap = buildProfileMap(profiles ?? []);
  const enriched = (versions ?? []).map((v) => enrichVersion(v, profileMap));

  return { success: true, message: "Version history retrieved.", versions: enriched };
}

/**
 * Restore a specific version of a document.
 */
export async function restoreVersion(versionId: string): Promise<DocumentActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch version
  const { data: version } = await supabase
    .from("document_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  if (!version) {
    return { success: false, message: "Version not found.", error: "NOT_FOUND" };
  }

  // Fetch document for workspace membership check
  const { data: document } = await supabase
    .from("documents")
    .select("id, workspace_id, title")
    .eq("id", version.document_id)
    .single();

  if (!document) {
    return { success: false, message: "Document not found.", error: "NOT_FOUND" };
  }

  let membership;
  try { membership = await verifyWorkspaceMembership(document.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot restore versions.", error: "FORBIDDEN" };
  }

  // Restore document content from version
  const { error } = await supabase
    .from("documents")
    .update({
      title: version.title,
      content: version.content,
      word_count: version.word_count,
      character_count: version.character_count,
      last_edited_by: profile.id,
      last_edited_at: new Date().toISOString(),
    })
    .eq("id", version.document_id);

  if (error) {
    logger.error("Failed to restore version", { versionId, reason: error.message });
    return { success: false, message: "Failed to restore version.", error: "UPDATE_FAILED" };
  }

  logger.info("Version restored", { versionId, documentId: version.document_id });
  await logActivity(
    "version_restored" as ActivityAction,
    `Restored version ${version.version_number} of: ${document.title}`,
    { versionId, documentId: version.document_id },
    document.workspace_id,
  );

  return { success: true, message: "Version restored." };
}

/**
 * Get document statistics for a workspace.
 */
export async function getDocumentStats(
  workspaceId: string,
): Promise<
  DocumentActionResponse & {
    stats?: {
      total: number;
      by_type: Record<string, number>;
      by_status: Record<string, number>;
      favorites: number;
      pinned: number;
    };
  }
> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Count total (non-deleted)
  const { count: total } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted");

  // Count by type
  const { data: typeRows } = await supabase
    .from("documents")
    .select("document_type")
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted");

  // Count by status
  const { data: statusRows } = await supabase
    .from("documents")
    .select("status")
    .eq("workspace_id", workspaceId);

  // Count favorites and pinned
  const { count: favorites } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("is_favorite", true);

  const { count: pinned } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("is_pinned", true);

  const byType: Record<string, number> = {};
  for (const row of typeRows ?? []) {
    byType[row.document_type] = (byType[row.document_type] ?? 0) + 1;
  }

  const byStatus: Record<string, number> = {};
  for (const row of statusRows ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }

  return {
    success: true,
    message: "Stats retrieved.",
    stats: {
      total: total ?? 0,
      by_type: byType,
      by_status: byStatus,
      favorites: favorites ?? 0,
      pinned: pinned ?? 0,
    },
  };
}

/**
 * AI document assistant — calls OpenAI to perform an action on the given text.
 */
export async function aiDocumentAssistant(
  text: string,
  action: AiAssistantAction,
  _provider?: string,
  model?: string,
  language?: string,
  context?: string,
): Promise<AiAssistantResponse> {
  const profile = await requireAuth();
  void profile; // Auth verified above

  if (!text || !text.trim()) {
    return { success: false, error: "Text is required." };
  }

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "AI provider is not configured." };
  }

  const prompt = buildAiPrompt(action, text, language, context);
  const selectedModel = model ?? "gpt-4o-mini";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful document assistant. Follow the user's instruction precisely and return only the requested output without extra commentary.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("OpenAI API error", { status: response.status, body: errorBody });
      return { success: false, error: `AI request failed with status ${response.status}.` };
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const result = data.choices?.[0]?.message?.content ?? "";

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("AI assistant error", { action, reason: message });
    return { success: false, error: `AI assistant error: ${message}` };
  }
}
