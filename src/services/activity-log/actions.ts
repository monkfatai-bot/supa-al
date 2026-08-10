"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import type { ActivityAction, ActivityLog } from "@/types/generated/database";

/**
 * Log an activity. Fire-and-forget — does NOT throw on failure.
 * Called from other server actions that already checked auth.
 */
export async function logActivity(
  action: ActivityAction,
  description?: string,
  metadata?: Record<string, unknown>,
  workspaceId?: string
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    let ipAddress = "";
    let userAgent = "";

    try {
      const headersList = await headers();
      ipAddress = headersList.get("x-forwarded-for") ?? headersList.get("x-real-ip") ?? "";
      userAgent = headersList.get("user-agent") ?? "";
    } catch {
      // headers() can fail in some contexts — ignore
    }

    await supabase.from("activity_logs").insert({
      user_id: user.id,
      workspace_id: workspaceId ?? null,
      action,
      description: description ?? "",
      metadata: metadata ?? {},
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch {
    // Fire-and-forget: never throw to avoid breaking the calling operation
  }
}

/**
 * Get recent activity logs for the current user.
 */
export async function getActivityLogs(limit: number = 50): Promise<ActivityLog[]> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("Failed to fetch activity logs", { reason: error.message });
    return [];
  }

  return data ?? [];
}

/**
 * Get count of unread notifications for the current user.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  if (error) {
    logger.error("Failed to count unread notifications", { reason: error.message });
    return 0;
  }

  return count ?? 0;
}
