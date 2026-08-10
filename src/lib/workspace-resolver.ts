import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { getAuthenticatedUser } from "@/services/auth/session";

/**
 * Get the first workspace the authenticated user is a member of.
 * For pages that need a workspaceId but don't have one in the URL.
 */
export async function resolveWorkspaceId(): Promise<string | null> {
  const profile = await getAuthenticatedUser();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", profile.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .single();

  return membership?.workspace_id ?? null;
}
