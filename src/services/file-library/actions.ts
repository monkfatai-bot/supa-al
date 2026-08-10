"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { PAGINATION } from "@/config/constants";
import type { FileLibrary, InsertTables } from "@/types/generated/database";
import type {
  FileActionResponse,
  FileFilters,
  FileWithUploader,
} from "./types";

// ── Constants ───────────────────────────────────────────────────────────────

const FILE_BUCKET = "workspace-files";
const MAX_FILE_SIZE_BYTES = 100 * 1_048_576; // 100 MB

const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/json",
  "text/markdown",
  // Images
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
]);

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Sanitize file name for storage path. */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 200);
}

// ── Server actions ──────────────────────────────────────────────────────────

/**
 * Get a paginated list of files for a workspace.
 */
export async function getFiles(
  filters: FileFilters,
  page: number = 1,
  pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE,
): Promise<FileActionResponse & { files?: FileWithUploader[]; total?: number }> {
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
    .from("file_library")
    .select("*", { count: "exact" })
    .eq("workspace_id", filters.workspace_id);

  if (filters.folder_id !== undefined) {
    if (filters.folder_id === null) {
      query = query.is("folder_id", null);
    } else {
      query = query.eq("folder_id", filters.folder_id);
    }
  }
  if (filters.mime_type) {
    query = query.eq("mime_type", filters.mime_type);
  }
  if (filters.search) {
    query = query.ilike("file_name", `%${filters.search}%`);
  }

  const sortBy = filters.sort_by ?? "created_at";
  const sortOrder = filters.sort_order ?? "desc";
  query = query.order(sortBy, { ascending: sortOrder === "asc" });
  query = query.range(offset, offset + size - 1);

  const { data: files, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch files", { reason: error.message });
    return { success: false, message: "Failed to fetch files.", error: "FETCH_FAILED" };
  }

  // Batch-fetch uploader profiles
  const uploaderIds = [...new Set((files ?? []).map((f) => f.uploaded_by))];
  const { data: profiles } = uploaderIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", uploaderIds)
    : { data: [] };

  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
  }

  const enriched: FileWithUploader[] = (files ?? []).map((f) => {
    const p = profileMap.get(f.uploaded_by);
    return {
      ...f,
      uploader_name: p?.full_name ?? null,
      uploader_avatar: p?.avatar_url ?? null,
    };
  });

  return { success: true, message: "Files retrieved.", files: enriched, total: count ?? 0 };
}

/**
 * Get a single file by ID.
 */
export async function getFile(
  id: string,
): Promise<FileActionResponse & { file?: FileWithUploader }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: file, error } = await supabase
    .from("file_library")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !file) {
    return { success: false, message: "File not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(file.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: p } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", file.uploaded_by)
    .single();

  return {
    success: true,
    message: "File retrieved.",
    file: {
      ...file,
      uploader_name: p?.full_name ?? null,
      uploader_avatar: p?.avatar_url ?? null,
    },
  };
}

/**
 * Upload a file to the workspace file library.
 */
export async function uploadFile(
  workspaceId: string,
  file: File,
  folderId?: string,
): Promise<FileActionResponse & { file?: FileLibrary }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Validate mime type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      message: `Unsupported file type: ${file.type}.`,
      error: "INVALID_MIME_TYPE",
    };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      message: `File too large. Maximum allowed size is 100 MB.`,
      error: "FILE_TOO_LARGE",
    };
  }

  if (file.size === 0) {
    return { success: false, message: "Empty file.", error: "EMPTY_FILE" };
  }

  // Upload to storage
  const sanitized = sanitizeFileName(file.name);
  const storagePath = `${workspaceId}/${profile.id}/${Date.now()}-${sanitized}`;

  const fileBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(FILE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    logger.error("File upload failed", { workspaceId, storagePath, reason: uploadError.message });
    return { success: false, message: "Failed to upload file.", error: "UPLOAD_FAILED" };
  }

  // Create database record
  const dbInsert: InsertTables<"file_library"> = {
    workspace_id: workspaceId,
    folder_id: folderId ?? null,
    file_name: sanitized,
    original_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    storage_path: storagePath,
    file_url: "",
    uploaded_by: profile.id,
    metadata: {},
  };

  const { data: fileRecord, error: dbError } = await supabase
    .from("file_library")
    .insert(dbInsert)
    .select()
    .single();

  if (dbError || !fileRecord) {
    logger.error("Failed to create file record", { workspaceId, reason: dbError?.message });
    // Clean up storage
    const admin = createAdminClient();
    await admin.storage.from(FILE_BUCKET).remove([storagePath]);
    return { success: false, message: "Failed to save file record.", error: "DB_FAILED" };
  }

  logger.info("File uploaded", { fileId: fileRecord.id, workspaceId, fileName: file.name });
  await logActivity("file_uploaded", `Uploaded file: ${file.name}`, { file_id: fileRecord.id }, workspaceId);
  return { success: true, message: "File uploaded.", file: fileRecord };
}

/**
 * Get a signed download URL for a file.
 */
export async function downloadFile(
  id: string,
): Promise<FileActionResponse & { signedUrl?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: file, error } = await supabase
    .from("file_library")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !file) {
    return { success: false, message: "File not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(file.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data, error: urlError } = await supabase.storage
    .from(FILE_BUCKET)
    .createSignedUrl(file.storage_path, 3600);

  if (urlError || !data) {
    logger.error("Failed to create signed URL", { fileId: id, reason: urlError?.message });
    return { success: false, message: "Failed to generate download URL.", error: "URL_FAILED" };
  }

  await logActivity("file_downloaded", `Downloaded file: ${file.original_name}`, { file_id: file.id }, file.workspace_id);
  return { success: true, message: "Download URL generated.", signedUrl: data.signedUrl };
}

/**
 * Delete a file from the library and storage.
 */
export async function deleteFile(id: string): Promise<FileActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: file, error } = await supabase
    .from("file_library")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !file) {
    return { success: false, message: "File not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(file.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Delete from database
  const { error: dbError } = await supabase
    .from("file_library")
    .delete()
    .eq("id", id);

  if (dbError) {
    logger.error("Failed to delete file record", { fileId: id, reason: dbError.message });
    return { success: false, message: "Failed to delete file.", error: "DELETE_FAILED" };
  }

  // Delete from storage (use admin client to bypass RLS)
  const admin = createAdminClient();
  const { error: storageError } = await admin.storage
    .from(FILE_BUCKET)
    .remove([file.storage_path]);

  if (storageError) {
    logger.warn("Failed to delete file from storage", { storagePath: file.storage_path, reason: storageError.message });
  }

  logger.info("File deleted", { fileId: id, workspaceId: file.workspace_id });
  await logActivity("file_deleted", `Deleted file: ${file.original_name}`, { file_id: file.id }, file.workspace_id);
  return { success: true, message: "File deleted." };
}

/**
 * Update a file (folder assignment, favorite status).
 */
export async function updateFile(
  id: string,
  updates: { folder_id?: string | null; is_favorite?: boolean },
): Promise<FileActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: file, error } = await supabase
    .from("file_library")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !file) {
    return { success: false, message: "File not found.", error: "NOT_FOUND" };
  }

  try { await verifyWorkspaceMembership(file.workspace_id, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const dbUpdates: Record<string, unknown> = {};
  if (updates.folder_id !== undefined) dbUpdates.folder_id = updates.folder_id;
  if (updates.is_favorite !== undefined) dbUpdates.is_favorite = updates.is_favorite;

  if (Object.keys(dbUpdates).length === 0) {
    return { success: false, message: "No valid fields to update.", error: "NO_UPDATES" };
  }

  const { error: updateError } = await supabase
    .from("file_library")
    .update(dbUpdates)
    .eq("id", id);

  if (updateError) {
    logger.error("Failed to update file", { fileId: id, reason: updateError.message });
    return { success: false, message: "Failed to update file.", error: "UPDATE_FAILED" };
  }

  return { success: true, message: "File updated." };
}

/**
 * Get total storage usage (sum of size_bytes) for a workspace.
 */
export async function getStorageUsage(
  workspaceId: string,
): Promise<FileActionResponse & { totalBytes?: number }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data, error } = await supabase
    .from("file_library")
    .select("size_bytes")
    .eq("workspace_id", workspaceId);

  if (error) {
    logger.error("Failed to fetch storage usage", { workspaceId, reason: error.message });
    return { success: false, message: "Failed to fetch storage usage.", error: "FETCH_FAILED" };
  }

  const totalBytes = (data ?? []).reduce((sum, row) => sum + row.size_bytes, 0);
  return { success: true, message: "Storage usage retrieved.", totalBytes };
}
