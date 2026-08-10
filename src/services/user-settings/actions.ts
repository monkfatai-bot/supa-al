"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import type { UserSettings } from "@/types/generated/database";
import type { SettingsUpdateData } from "./types";

/**
 * Get or create user settings.
 */
export async function getUserSettings(): Promise<UserSettings> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", profile.id)
    .single();

  if (data) return data;

  return await ensureUserSettings(profile.id);
}

/**
 * Update user settings.
 */
export async function updateUserSettings(
  data: SettingsUpdateData
): Promise<{ success: boolean; message: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const updates: Record<string, unknown> = {};

  if (data.theme !== undefined) {
    const validThemes = ["system", "light", "dark"];
    if (!validThemes.includes(data.theme)) {
      return { success: false, message: "Invalid theme value." };
    }
    updates.theme = data.theme;
  }

  if (data.language !== undefined) {
    if (typeof data.language !== "string" || data.language.length < 2 || data.language.length > 5) {
      return { success: false, message: "Language must be a 2-5 character string." };
    }
    updates.language = data.language;
  }

  if (data.email_notifications !== undefined) {
    updates.email_notifications = data.email_notifications;
  }

  if (data.workspace_notifications !== undefined) {
    updates.workspace_notifications = data.workspace_notifications;
  }

  if (data.security_alerts !== undefined) {
    updates.security_alerts = data.security_alerts;
  }

  if (data.active_workspace_id !== undefined) {
    updates.active_workspace_id = data.active_workspace_id;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, message: "No valid fields to update." };
  }

  const { error } = await supabase
    .from("user_settings")
    .update(updates)
    .eq("user_id", profile.id);

  if (error) {
    logger.error("Failed to update user settings", {
      userId: profile.id,
      reason: error.message,
    });
    return { success: false, message: "Failed to update settings." };
  }

  logger.info("User settings updated", { userId: profile.id });
  return { success: true, message: "Settings updated." };
}

/**
 * Ensure user settings exist. Called internally — NO auth check since
 * it may be called from trigger contexts.
 */
export async function ensureUserSettings(userId: string): Promise<UserSettings> {
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("user_settings")
    .insert({ user_id: userId })
    .select()
    .single();

  if (error || !data) {
    logger.error("Failed to create user settings", {
      userId,
      reason: error?.message ?? "unknown",
    });
    throw new Error("Failed to create user settings");
  }

  return data;
}
