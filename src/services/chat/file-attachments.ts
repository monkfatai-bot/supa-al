"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/json",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface FileUploadResult {
  success: boolean;
  message: string;
  attachment?: {
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    content_text?: string;
  };
  error?: string;
}

/**
 * Upload a file and optionally extract text content.
 */
export async function uploadFileAttachment(
  conversationId: string,
  formData: FormData
): Promise<FileUploadResult> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const file = formData.get("file") as File | null;
  if (!file) {
    return { success: false, message: "No file provided.", error: "NO_FILE" };
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { success: false, message: `File type '${file.type}' is not supported.`, error: "INVALID_TYPE" };
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, message: `File too large (max 10MB).`, error: "FILE_TOO_LARGE" };
  }
  if (file.size === 0) {
    return { success: false, message: "File is empty.", error: "EMPTY_FILE" };
  }

  const storagePath = `${profile.id}/${conversationId}/${Date.now()}-${file.name}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("file-attachments")
    .upload(storagePath, file);

  if (uploadError) {
    logger.error("Failed to upload file attachment", { reason: uploadError.message, file: file.name });
    return { success: false, message: "Failed to upload file.", error: "UPLOAD_FAILED" };
  }

  // Extract text content from text-based files
  let contentText: string | null = null;
  if (file.type.startsWith("text/") || file.type === "application/json") {
    try {
      contentText = await file.text();
    } catch {
      contentText = null;
    }
  }

  // Save metadata to DB
  const { data: attachment, error: dbError } = await supabase
    .from("file_attachments")
    .insert({
      user_id: profile.id,
      conversation_id: conversationId,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      content_text: contentText,
    })
    .select("id, file_name, file_type, file_size, content_text")
    .single();

  if (dbError) {
    logger.error("Failed to save file attachment metadata", { reason: dbError.message });
    return { success: false, message: "Failed to save file metadata.", error: "DB_FAILED" };
  }

  return {
    success: true,
    message: "File uploaded.",
    attachment,
  };
}

/**
 * Get all file attachments for a conversation.
 */
export async function getFileAttachments(conversationId: string) {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("file_attachments")
    .select("id, file_name, file_type, file_size, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch file attachments", { reason: error.message });
    return [];
  }

  return data ?? [];
}

/**
 * Get text content of a file attachment for use as AI context.
 */
export async function getFileAttachmentContent(attachmentId: string): Promise<string | null> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("file_attachments")
    .select("content_text")
    .eq("id", attachmentId)
    .single();

  if (error || !data) {
    logger.error("Failed to fetch file content", { attachmentId, reason: error?.message });
    return null;
  }

  return data.content_text;
}

/**
 * Delete a file attachment.
 */
export async function deleteFileAttachment(attachmentId: string) {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: attachment, error: fetchError } = await supabase
    .from("file_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .single();

  if (!fetchError && attachment?.storage_path) {
    await supabase.storage.from("file-attachments").remove([attachment.storage_path]);
  }

  const { error: deleteError } = await supabase
    .from("file_attachments")
    .delete()
    .eq("id", attachmentId);

  if (deleteError) {
    logger.error("Failed to delete file attachment", { attachmentId, reason: deleteError.message });
    return { success: false, message: "Failed to delete file." };
  }

  return { success: true, message: "File deleted." };
}
