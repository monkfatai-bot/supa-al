import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertMember } from "@/lib/workspace/core";

/**
 * Service-role clients bypass RLS. Every voice route must therefore call this
 * before it passes a workspace identifier into a privileged voice service.
 */
export async function assertVoiceWorkspaceMembership(
  workspaceId: string,
  userId: string,
): Promise<void> {
  await assertMember(createSupabaseAdminClient(), workspaceId, userId);
}
