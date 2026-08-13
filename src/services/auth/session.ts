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
 * Should not throw - auth flow must continue even if profile creation fails.
 */
export async function ensureProfile(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    // Check if profile already exists
    const { data: existing, error: checkError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 = no rows returned (expected), other errors should be logged
      console.warn("Error checking profile existence:", checkError);
      return; // Don't break auth flow
    }

    if (existing) {
      console.log("Profile already exists for user", { userId });
      return;
    }

    // Get user metadata from auth
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);

    if (authError) {
      console.warn("Error fetching auth user:", authError);
      return; // Don't break auth flow
    }

    const insertData = {
      id: userId,
      full_name: authData.user?.user_metadata?.full_name ?? null,
      avatar_url: authData.user?.user_metadata?.avatar_url ?? null,
    };

    const { error: insertError } = await admin.from("profiles").insert(insertData);

    if (insertError) {
      console.warn("Error creating profile:", insertError);
      // Don't throw - profile creation failure shouldn't block login
      return;
    }

    logger.info("Profile created for user", { userId });
  } catch (error) {
    // Catch any unexpected errors but don't break the auth flow
    console.error("Unexpected error in ensureProfile:", error);
    logger.warn("Failed to ensure profile exists", { userId, error });
    // Continue - user is authenticated even if profile creation failed
  }
}
