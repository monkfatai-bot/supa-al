"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";
import { logActivity } from "@/services/activity-log/actions";
import type { ActivityAction, Folder } from "@/types/generated/database";
import type {
  FolderActionResponse,
  GetFolderResponse,
  FolderWithChildren,
  FolderTreeItem,
  FolderTree,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verify the user is a member of the given workspace.
 * Returns the membership row or null.
 */
/**
 * Build a tree structure from a flat list of folders.
 */
function buildTree(
  folders: Folder[],
  documentCounts: Record<string, number>,
  parentId: string | null = null,
): FolderTreeItem[] {
  const children: FolderTreeItem[] = [];

  for (const folder of folders) {
    if (folder.parent_id === parentId) {
      children.push({
        id: folder.id,
        name: folder.name,
        parent_id: folder.parent_id,
        children: buildTree(folders, documentCounts, folder.id),
        document_count: documentCounts[folder.id] ?? 0,
        color: folder.color,
        icon: folder.icon,
        is_archived: folder.is_archived,
        is_favorite: folder.is_favorite,
      });
    }
  }

  return children.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Server actions ──────────────────────────────────────────────────────────

/**
 * Get folders for a workspace, optionally filtered by parent.
 */
export async function getFolders(
  workspaceId: string,
  parentId?: string,
): Promise<FolderActionResponse & { folders?: FolderWithChildren[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  let query = supabase
    .from("folders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (parentId !== undefined) {
    query = query.eq("parent_id", parentId);
  }

  const { data: folders, error } = await query;

  if (error) {
    logger.error("Failed to fetch folders", { workspaceId, reason: error.message });
    return { success: false, message: "Failed to fetch folders.", error: "FETCH_FAILED" };
  }

  // Build children mapping
  const folderMap = new Map<string, FolderWithChildren>();
  for (const f of folders ?? []) {
    folderMap.set(f.id, { ...f, children: [] });
  }

  // Assign children
  for (const f of folders ?? []) {
    const parent = f.parent_id ? folderMap.get(f.parent_id) : null;
    if (parent) {
      parent.children.push(folderMap.get(f.id)!);
    }
  }

  // If parentId is specified, return only those folders
  const result = parentId !== undefined
    ? (folders ?? []).map((f) => folderMap.get(f.id)!)
    : (folders ?? []).map((f) => folderMap.get(f.id)!);

  return { success: true, message: "Folders retrieved.", folders: result };
}

/**
 * Get the full folder tree for a workspace.
 */
export async function getFolderTree(
  workspaceId: string,
): Promise<FolderActionResponse & { tree?: FolderTree }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: folders, error } = await supabase
    .from("folders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (error) {
    logger.error("Failed to fetch folder tree", { workspaceId, reason: error.message });
    return { success: false, message: "Failed to fetch folder tree.", error: "FETCH_FAILED" };
  }

  // Count documents in each folder
  const { data: docCounts } = await supabase
    .from("documents")
    .select("folder_id")
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted");

  const documentCounts: Record<string, number> = {};
  for (const d of docCounts ?? []) {
    if (d.folder_id) {
      documentCounts[d.folder_id] = (documentCounts[d.folder_id] ?? 0) + 1;
    }
  }

  const tree = buildTree(folders ?? [], documentCounts);
  return { success: true, message: "Folder tree retrieved.", tree };
}

/**
 * Get a single folder by ID.
 */
export async function getFolder(id: string): Promise<GetFolderResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: folder, error } = await supabase
    .from("folders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !folder) {
    return { success: false, message: "Folder not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(folder.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  return { success: true, message: "Folder retrieved.", folder };
}

/**
 * Create a new folder.
 */
export async function createFolder(
  workspaceId: string,
  name: string,
  parentId?: string,
  color?: string,
  icon?: string,
): Promise<FolderActionResponse & { folder?: Folder }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  let membership;
  try { membership = await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot create folders.", error: "FORBIDDEN" };
  }

  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 100) {
    return { success: false, message: "Folder name must be 1-100 characters.", error: "INVALID_NAME" };
  }

  // If parent is specified, verify it exists
  if (parentId) {
    const { data: parentFolder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", parentId)
      .eq("workspace_id", workspaceId)
      .single();

    if (!parentFolder) {
      return { success: false, message: "Parent folder not found.", error: "NOT_FOUND" };
    }
  }

  const { data: folder, error } = await supabase
    .from("folders")
    .insert({
      workspace_id: workspaceId,
      parent_id: parentId ?? null,
      name: trimmedName,
      description: "",
      color: color ?? "#6366f1",
      icon: icon ?? "folder",
      sort_order: 0,
      is_favorite: false,
      is_archived: false,
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !folder) {
    logger.error("Failed to create folder", { workspaceId, reason: error?.message });
    return { success: false, message: "Failed to create folder.", error: "CREATE_FAILED" };
  }

  logger.info("Folder created", { folderId: folder.id, workspaceId });
  await logActivity(
    "folder_created" as ActivityAction,
    `Created folder: ${trimmedName}`,
    { folderId: folder.id },
    workspaceId,
  );

  return { success: true, message: "Folder created.", folder };
}

/**
 * Update a folder.
 */
export async function updateFolder(
  id: string,
  updates: {
    name?: string;
    color?: string;
    icon?: string;
    description?: string;
    parent_id?: string | null;
    is_favorite?: boolean;
    is_archived?: boolean;
    sort_order?: number;
  },
): Promise<FolderActionResponse & { folder?: Folder }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("folders")
    .select("*")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Folder not found.", error: "NOT_FOUND" };
  }

  let membership;
  try { membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot update folders.", error: "FORBIDDEN" };
  }

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed || trimmed.length > 100) {
      return { success: false, message: "Folder name must be 1-100 characters.", error: "INVALID_NAME" };
    }
    dbUpdates.name = trimmed;
  }
  if (updates.color !== undefined) dbUpdates.color = updates.color;
  if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.parent_id !== undefined) dbUpdates.parent_id = updates.parent_id;
  if (updates.is_favorite !== undefined) dbUpdates.is_favorite = updates.is_favorite;
  if (updates.is_archived !== undefined) dbUpdates.is_archived = updates.is_archived;
  if (updates.sort_order !== undefined) dbUpdates.sort_order = updates.sort_order;

  // Prevent setting parent to self (would create a cycle)
  if (updates.parent_id === id) {
    return { success: false, message: "Cannot set folder as its own parent.", error: "INVALID_PARENT" };
  }

  const { data: folder, error } = await supabase
    .from("folders")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error || !folder) {
    logger.error("Failed to update folder", { folderId: id, reason: error?.message });
    return { success: false, message: "Failed to update folder.", error: "UPDATE_FAILED" };
  }

  logger.info("Folder updated", { folderId: id });
  await logActivity(
    "folder_updated" as ActivityAction,
    `Updated folder: ${folder.name}`,
    { folderId: id },
    existing.workspace_id,
  );

  return { success: true, message: "Folder updated.", folder };
}

/**
 * Delete a folder.
 */
export async function deleteFolder(id: string): Promise<FolderActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("folders")
    .select("id, workspace_id, name")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Folder not found.", error: "NOT_FOUND" };
  }

  let membership;
  try { membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot delete folders.", error: "FORBIDDEN" };
  }

  // Unlink documents from this folder (set folder_id to null)
  await supabase
    .from("documents")
    .update({ folder_id: null })
    .eq("folder_id", id);

  // Delete the folder
  const { error } = await supabase.from("folders").delete().eq("id", id);

  if (error) {
    logger.error("Failed to delete folder", { folderId: id, reason: error.message });
    return { success: false, message: "Failed to delete folder.", error: "DELETE_FAILED" };
  }

  logger.info("Folder deleted", { folderId: id });
  await logActivity(
    "folder_deleted" as ActivityAction,
    `Deleted folder: ${existing.name}`,
    { folderId: id },
    existing.workspace_id,
  );
  revalidatePath("/dashboard");
  return { success: true, message: "Folder deleted." };
}

/**
 * Move a folder to a new parent.
 */
export async function moveFolder(
  id: string,
  newParentId: string | null,
): Promise<FolderActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("folders")
    .select("id, workspace_id, name, parent_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Folder not found.", error: "NOT_FOUND" };
  }

  if (id === newParentId) {
    return { success: false, message: "Cannot move folder into itself.", error: "INVALID_PARENT" };
  }

  let membership;
  try { membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Guests cannot move folders.", error: "FORBIDDEN" };
  }

  // If new parent specified, verify it exists in same workspace
  if (newParentId) {
    const { data: newParent } = await supabase
      .from("folders")
      .select("id, workspace_id")
      .eq("id", newParentId)
      .single();

    if (!newParent || newParent.workspace_id !== existing.workspace_id) {
      return { success: false, message: "Target folder not found.", error: "NOT_FOUND" };
    }
  }

  const { error } = await supabase
    .from("folders")
    .update({ parent_id: newParentId })
    .eq("id", id);

  if (error) {
    logger.error("Failed to move folder", { folderId: id, newParentId, reason: error.message });
    return { success: false, message: "Failed to move folder.", error: "UPDATE_FAILED" };
  }

  logger.info("Folder moved", { folderId: id, newParentId });
  await logActivity(
    "folder_updated" as ActivityAction,
    `Moved folder: ${existing.name}`,
    { folderId: id, newParentId },
    existing.workspace_id,
  );

  return { success: true, message: "Folder moved." };
}

/**
 * Get the breadcrumb path for a folder (array of folders from root to target).
 */
export async function getFolderPath(
  id: string,
): Promise<FolderActionResponse & { path?: Array<{ id: string; name: string; parent_id: string | null }> }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: folder } = await supabase
    .from("folders")
    .select("id, workspace_id, name, parent_id")
    .eq("id", id)
    .single();

  if (!folder) {
    return { success: false, message: "Folder not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(folder.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Fetch all folders in workspace for path traversal
  const { data: allFolders } = await supabase
    .from("folders")
    .select("id, name, parent_id")
    .eq("workspace_id", folder.workspace_id);

  if (!allFolders) {
    return { success: true, message: "Path retrieved.", path: [{ id: folder.id, name: folder.name, parent_id: folder.parent_id }] };
  }

  // Build a map for quick lookup
  const folderMap = new Map<string, { id: string; name: string; parent_id: string | null }>();
  for (const f of allFolders) {
    folderMap.set(f.id, f);
  }

  // Walk up from target folder to root
  const path: Array<{ id: string; name: string; parent_id: string | null }> = [];
  let current: { id: string; name: string; parent_id: string | null } | undefined = folderMap.get(id);

  while (current) {
    path.unshift({ id: current.id, name: current.name, parent_id: current.parent_id });
    current = current.parent_id ? folderMap.get(current.parent_id) : undefined;
  }

  return { success: true, message: "Path retrieved.", path };
}
