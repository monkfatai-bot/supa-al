import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { ROUTES } from "@/config/constants";
import { logger } from "@/services/logger";
import type { Profile } from "@/types/generated/database";

/**
 * Get the currently authenticated user's profile.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedUser(): Promise<Profile | null> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}

/**
 * Require authentication. Returns the user profile or redirects to login.
 * Use this in server components and server actions that need auth.
 */
export async function requireAuth(): Promise<Profile> {
  const profile = await getAuthenticatedUser();

  if (!profile) {
    redirect(ROUTES.LOGIN);
  }

  return profile;
}

/**
 * Get the raw auth user (not the profile). Useful for email verification checks.
 */
export async function getAuthUser() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/**
 * Create or sync a profile for a given user ID.
 * Called by the auth callback to ensure profile exists.
 */
export async function ensureProfile(userId: string): Promise<void> {
  const admin = createAdminClient();

  // Check if profile already exists
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (existing) return;

  // Get user metadata from auth
  const { data: authUser } = await admin.auth.admin.getUserById(userId);

  await admin.from("profiles").insert({
    id: userId,
    full_name: authUser.user?.user_metadata?.full_name ?? null,
    avatar_url: authUser.user?.user_metadata?.avatar_url ?? null,
  });

  logger.info("Profile created for user", { userId });
}
