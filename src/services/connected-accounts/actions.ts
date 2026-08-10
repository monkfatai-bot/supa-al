"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import type { ConnectedAccount } from "@/types/generated/database";

/**
 * Get all connected OAuth accounts for the current user.
 */
export async function getConnectedAccounts(): Promise<ConnectedAccount[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("connected_accounts")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch connected accounts", { reason: error.message, userId: profile.id });
    return [];
  }

  return data ?? [];
}

/**
 * Disconnect a connected OAuth account.
 */
export async function disconnectAccount(accountId: string): Promise<{ success: boolean; message: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify ownership before deleting
  const { data: account, error: fetchError } = await supabase
    .from("connected_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (fetchError || !account) {
    logger.warn("Disconnect account failed — not found or not owned", { accountId, userId: profile.id });
    return { success: false, message: "Connected account not found." };
  }

  const { error } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("id", accountId);

  if (error) {
    logger.error("Failed to disconnect account", { reason: error.message, accountId, userId: profile.id });
    return { success: false, message: "Failed to disconnect account. Please try again." };
  }

  logger.info("Account disconnected", { accountId, userId: profile.id });
  revalidatePath("/dashboard/settings");
  return { success: true, message: "Account disconnected." };
}
