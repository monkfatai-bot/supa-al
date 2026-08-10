"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export interface AvatarUploadResponse {
  success: boolean;
  message: string;
  avatarUrl?: string;
  error?: string;
}

/**
 * Upload an avatar image for the current user.
 */
export async function uploadAvatar(formData: FormData): Promise<AvatarUploadResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const file = formData.get("avatar") as File | null;
  if (!file) {
    return { success: false, message: "No file provided.", error: "NO_FILE" };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, message: "Invalid file type. Use PNG, JPEG, WebP, or GIF.", error: "INVALID_TYPE" };
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return { success: false, message: "File too large. Maximum 2MB.", error: "FILE_TOO_LARGE" };
  }

  const ext = file.type.split("/")[1];
  const storagePath = `${profile.id}/avatar.${ext}`;

  // Delete old avatar
  const { data: existingFiles } = await supabase.storage
    .from("avatars")
    .list(profile.id);

  if (existingFiles && existingFiles.length > 0) {
    const oldPaths = existingFiles.map((f) => `${profile.id}/${f.name}`);
    await supabase.storage.from("avatars").remove(oldPaths);
  }

  // Upload new avatar
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    logger.error("Failed to upload avatar", { reason: uploadError.message });
    return { success: false, message: "Failed to upload avatar.", error: "UPLOAD_FAILED" };
  }

  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(storagePath);

  const avatarUrl = urlData.publicUrl;

  // Update profile
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", profile.id);

  if (updateError) {
    logger.error("Failed to update profile avatar", { reason: updateError.message });
    return { success: false, message: "Uploaded but failed to update profile.", error: "UPDATE_FAILED" };
  }

  void logActivity("avatar_update", "Updated profile avatar");

  logger.info("Avatar uploaded", { userId: profile.id });
  return { success: true, message: "Avatar updated.", avatarUrl };
}

/**
 * Remove the user's avatar.
 */
export async function removeAvatar(): Promise<{ success: boolean; message: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: files } = await supabase.storage
    .from("avatars")
    .list(profile.id);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${profile.id}/${f.name}`);
    await supabase.storage.from("avatars").remove(paths);
  }

  await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);

  logger.info("Avatar removed", { userId: profile.id });
  return { success: true, message: "Avatar removed." };
}
