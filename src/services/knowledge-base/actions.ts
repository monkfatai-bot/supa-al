"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { PAGINATION } from "@/config/constants";
import type { KnowledgeBase, KnowledgeEntryType, InsertTables, UpdateTables } from "@/types/generated/database";
import type {
  KnowledgeActionResponse,
  KnowledgeFilters,
  KnowledgeWithCreator,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────
// ── Server actions ──────────────────────────────────────────────────────────

/**
 * Get a paginated list of knowledge base entries.
 */
export async function getKnowledgeEntries(
  filters: KnowledgeFilters,
  page: number = 1,
  pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE,
): Promise<KnowledgeActionResponse & { entries?: KnowledgeWithCreator[]; total?: number }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const size = Math.min(pageSize, PAGINATION.MAX_PAGE_SIZE);
  const offset = (page - 1) * size;

  if (!filters.workspace_id) {
    return { success: false, message: "Workspace ID is required.", error: "MISSING_WORKSPACE" };
  }

  try { await verifyWorkspaceMembership(filters.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  let query = supabase
    .from("knowledge_base")
    .select("*", { count: "exact" })
    .eq("workspace_id", filters.workspace_id);

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.entry_type) query = query.eq("entry_type", filters.entry_type);
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains("tags", filters.tags);
  }
  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
  }

  const sortBy = filters.sort_by ?? "updated_at";
  const sortOrder = filters.sort_order ?? "desc";
  query = query.order(sortBy, { ascending: sortOrder === "asc" });
  query = query.range(offset, offset + size - 1);

  const { data: entries, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch knowledge entries", { reason: error.message });
    return { success: false, message: "Failed to fetch knowledge entries.", error: "FETCH_FAILED" };
  }

  // Batch-fetch creator profiles
  const creatorIds = [...new Set((entries ?? []).map((e) => e.created_by))];
  const { data: profiles } = creatorIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] };

  const profileMap = new Map<string, string | null>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, p.full_name);
  }

  const enriched: KnowledgeWithCreator[] = (entries ?? []).map((e) => ({
    ...e,
    creator_name: profileMap.get(e.created_by) ?? null,
  }));

  return { success: true, message: "Knowledge entries retrieved.", entries: enriched, total: count ?? 0 };
}

/**
 * Get a single knowledge base entry by ID.
 */
export async function getKnowledgeEntry(
  id: string,
): Promise<KnowledgeActionResponse & { entry?: KnowledgeWithCreator }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: entry, error } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !entry) {
    return { success: false, message: "Entry not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(entry.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: p } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", entry.created_by)
    .single();

  return {
    success: true,
    message: "Entry retrieved.",
    entry: { ...entry, creator_name: p?.full_name ?? null },
  };
}

/**
 * Create a new knowledge base entry.
 */
export async function createKnowledgeEntry(
  workspaceId: string,
  data: {
    title: string;
    content: string;
    entry_type?: KnowledgeEntryType;
    category?: string;
    tags?: string[];
    source_urls?: string[];
    linked_document_ids?: string[];
  },
): Promise<KnowledgeActionResponse & { entry?: KnowledgeBase }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const trimmedTitle = data.title.trim();
  if (!trimmedTitle || trimmedTitle.length > 500) {
    return { success: false, message: "Title must be 1-500 characters.", error: "INVALID_TITLE" };
  }

  const dbInsert: InsertTables<"knowledge_base"> = {
    workspace_id: workspaceId,
    title: trimmedTitle,
    content: data.content ?? "",
    entry_type: data.entry_type ?? "article",
    category: data.category ?? "",
    tags: data.tags ?? [],
    source_urls: data.source_urls ?? [],
    linked_document_ids: data.linked_document_ids ?? [],
    is_indexed: false,
    created_by: profile.id,
  };

  const { data: entry, error } = await supabase
    .from("knowledge_base")
    .insert(dbInsert)
    .select()
    .single();

  if (error || !entry) {
    logger.error("Failed to create knowledge entry", { workspaceId, reason: error?.message });
    return { success: false, message: "Failed to create entry.", error: "CREATE_FAILED" };
  }

  logger.info("Knowledge entry created", { entryId: entry.id, workspaceId });
  await logActivity("knowledge_entry_created", `Created knowledge entry: ${trimmedTitle}`, { entry_id: entry.id }, workspaceId);
  return { success: true, message: "Entry created.", entry };
}

/**
 * Update a knowledge base entry.
 */
export async function updateKnowledgeEntry(
  id: string,
  updates: {
    title?: string;
    content?: string;
    entry_type?: KnowledgeEntryType;
    category?: string;
    tags?: string[];
    source_urls?: string[];
    linked_document_ids?: string[];
  },
): Promise<KnowledgeActionResponse & { entry?: KnowledgeBase }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Entry not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const dbUpdates: UpdateTables<"knowledge_base"> = {};
  if (updates.title !== undefined) {
    const trimmed = updates.title.trim();
    if (!trimmed || trimmed.length > 500) {
      return { success: false, message: "Title must be 1-500 characters.", error: "INVALID_TITLE" };
    }
    dbUpdates.title = trimmed;
  }
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.entry_type !== undefined) dbUpdates.entry_type = updates.entry_type;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.source_urls !== undefined) dbUpdates.source_urls = updates.source_urls;
  if (updates.linked_document_ids !== undefined) dbUpdates.linked_document_ids = updates.linked_document_ids;
  dbUpdates.updated_by = profile.id;

  const { data: entry, error: updateError } = await supabase
    .from("knowledge_base")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (updateError || !entry) {
    logger.error("Failed to update knowledge entry", { entryId: id, reason: updateError?.message });
    return { success: false, message: "Failed to update entry.", error: "UPDATE_FAILED" };
  }

  logger.info("Knowledge entry updated", { entryId: id, workspaceId: existing.workspace_id });
  await logActivity("knowledge_entry_updated", `Updated knowledge entry: ${entry.title}`, { entry_id: entry.id }, existing.workspace_id);
  return { success: true, message: "Entry updated.", entry };
}

/**
 * Delete a knowledge base entry.
 */
export async function deleteKnowledgeEntry(id: string): Promise<KnowledgeActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Entry not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { error: deleteError } = await supabase
    .from("knowledge_base")
    .delete()
    .eq("id", id);

  if (deleteError) {
    logger.error("Failed to delete knowledge entry", { entryId: id, reason: deleteError.message });
    return { success: false, message: "Failed to delete entry.", error: "DELETE_FAILED" };
  }

  logger.info("Knowledge entry deleted", { entryId: id, workspaceId: existing.workspace_id });
  await logActivity("knowledge_entry_created", `Deleted knowledge entry: ${existing.title}`, { entry_id: id }, existing.workspace_id);
  return { success: true, message: "Entry deleted." };
}

/**
 * Full-text search across knowledge base entries using the search_vector column.
 */
export async function searchKnowledge(
  workspaceId: string,
  query: string,
  limit: number = 20,
): Promise<KnowledgeActionResponse & { results?: KnowledgeBase[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!query.trim()) {
    return { success: true, message: "No results.", results: [] };
  }

  const { data, error } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("workspace_id", workspaceId)
    .textSearch("search_vector", query, {
      type: "websearch",
      config: "english",
    })
    .limit(limit);

  if (error) {
    logger.error("Knowledge search failed", { workspaceId, query, reason: error.message });
    return { success: false, message: "Search failed.", error: "SEARCH_FAILED" };
  }

  await logActivity("search_executed", `Searched knowledge base: ${query}`, { query }, workspaceId);
  return { success: true, message: "Search completed.", results: data ?? [] };
}

/**
 * Toggle the is_indexed flag on a knowledge base entry (marks for AI indexing).
 */
export async function toggleIndexed(id: string): Promise<KnowledgeActionResponse & { entry?: KnowledgeBase }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Entry not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: entry, error: updateError } = await supabase
    .from("knowledge_base")
    .update({ is_indexed: !existing.is_indexed, updated_by: profile.id })
    .eq("id", id)
    .select()
    .single();

  if (updateError || !entry) {
    logger.error("Failed to toggle index status", { entryId: id, reason: updateError?.message });
    return { success: false, message: "Failed to update entry.", error: "UPDATE_FAILED" };
  }

  logger.info("Knowledge entry index toggled", { entryId: id, isIndexed: entry.is_indexed });
  return { success: true, message: `Entry ${entry.is_indexed ? "marked for indexing" : "unmarked"}.`, entry };
}
