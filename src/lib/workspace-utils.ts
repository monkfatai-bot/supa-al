import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";
import type { WorkspaceMember } from "@/types/generated/database";

/** Resolve the workspace_id for a given workflow. Returns null if not found. */
export async function getWorkspaceIdByWorkflowId(workflowId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("workflows")
    .select("workspace_id")
    .eq("id", workflowId)
    .single();
  return data?.workspace_id ?? null;
}

/** Verify user is a member of the workspace. Returns the member record. Throws if not a member. */
export async function verifyWorkspaceMembership(workspaceId: string, userId: string): Promise<WorkspaceMember> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, user_id, workspace_id, role, joined_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Workspace membership required");
  }
  return data;
}

/** Verify membership AND check minimum role. Returns member record. Throws if not a member or insufficient role. */
export async function requireMinimumRole(workspaceId: string, userId: string, minimumRole: Role): Promise<WorkspaceMember> {
  const member = await verifyWorkspaceMembership(workspaceId, userId);
  const hasRole = hasMinimumRole(member.role as Role, minimumRole);
  if (!hasRole) {
    throw new Error(`Insufficient permissions. Required: ${minimumRole}`);
  }
  return member;
}
