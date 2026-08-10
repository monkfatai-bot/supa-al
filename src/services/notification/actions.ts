"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import type { Notification } from "@/types/generated/database";

/**
 * Get notifications for the current user.
 */
export async function getNotifications(
  limit: number = 20,
  includeRead: boolean = true
): Promise<Notification[]> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeRead) {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to fetch notifications", { reason: error.message });
    return [];
  }

  return data ?? [];
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(
  notificationId: string
): Promise<{ success: boolean; message: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);

  if (error) {
    logger.error("Failed to mark notification read", {
      notificationId,
      reason: error.message,
    });
    return { success: false, message: "Failed to mark notification as read." };
  }

  return { success: true, message: "Notification marked as read." };
}

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllNotificationsRead(): Promise<{
  success: boolean;
  message: string;
}> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false);

  if (error) {
    logger.error("Failed to mark all notifications read", {
      reason: error.message,
    });
    return { success: false, message: "Failed to mark all as read." };
  }

  return { success: true, message: "All notifications marked as read." };
}

/**
 * Delete a notification.
 */
export async function deleteNotification(
  notificationId: string
): Promise<{ success: boolean; message: string }> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId);

  if (error) {
    logger.error("Failed to delete notification", {
      notificationId,
      reason: error.message,
    });
    return { success: false, message: "Failed to delete notification." };
  }

  return { success: true, message: "Notification deleted." };
}

/**
 * Create a notification for a user. Called by other services.
 * Uses admin client to bypass RLS (creates for another user).
 * No requireAuth since it is called from other server actions.
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message?: string,
  link?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.from("notifications").insert({
    user_id: userId,
    type,
    title,
    message: message ?? "",
    link: link ?? "",
    is_read: false,
    metadata: metadata ?? {},
  });

  if (error) {
    logger.error("Failed to create notification", {
      userId,
      reason: error.message,
    });
  }
}
