"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";
import { logActivity } from "@/services/activity-log/actions";
import { ensureUserSettings } from "@/services/user-settings/actions";
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceInvitation,
} from "@/types/generated/database";
import type {
  WorkspaceActionResponse,
  GetWorkspaceResponse,
  WorkspaceWithMemberCount,
  MemberWithProfile,
} from "./types";

/**
 * Get all workspaces the user belongs to, with member count.
 */
export async function getWorkspaces(): Promise<WorkspaceWithMemberCount[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: memberships, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", profile.id);

  if (memberError || !memberships?.length) {
    return [];
  }

  const workspaceIds = memberships.map((m) => m.workspace_id);

  const { data: workspaces, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .in("id", workspaceIds);

  if (wsError || !workspaces) {
    logger.error("Failed to fetch workspaces", { reason: wsError?.message });
    return [];
  }

  // Get member counts for each workspace
  const results: WorkspaceWithMemberCount[] = [];
  for (const ws of workspaces) {
    const { count } = await supabase
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ws.id);

    results.push({ ...ws, member_count: count ?? 0 });
  }

  return results;
}

/**
 * Get a single workspace by ID with its members.
 */
export async function getWorkspace(
  workspaceId: string
): Promise<GetWorkspaceResponse & { members?: MemberWithProfile[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { success: false, message: "Workspace not found or access denied.", error: "NOT_FOUND" };
  }

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (wsError || !workspace) {
    return { success: false, message: "Workspace not found.", error: "NOT_FOUND" };
  }

  const { data: members } = await supabase
    .from("workspace_members")
    .select("*, profiles(full_name, avatar_url)")
    .eq("workspace_id", workspaceId);

  const memberList: MemberWithProfile[] = (members ?? []).map((m) => ({
    ...m,
    full_name: (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
    avatar_url: (m.profiles as { avatar_url: string | null } | null)?.avatar_url ?? null,
  }));

  return { success: true, message: "Workspace retrieved.", workspace, members: memberList };
}

/**
 * Create a new workspace.
 */
export async function createWorkspace(
  name: string,
  description?: string
): Promise<WorkspaceActionResponse & { workspace?: Workspace }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 100) {
    return { success: false, message: "Workspace name must be 1-100 characters.", error: "INVALID_NAME" };
  }

  const slugBase = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({
      name: trimmedName,
      slug,
      description: description?.trim() ?? "",
      owner_id: profile.id,
    })
    .select()
    .single();

  if (wsError || !workspace) {
    logger.error("Failed to create workspace", { reason: wsError?.message });
    return { success: false, message: "Failed to create workspace.", error: "CREATE_FAILED" };
  }

  // Add owner as member
  await supabase.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id: profile.id,
    role: "owner",
  });

  logger.info("Workspace created", { workspaceId: workspace.id });
  await logActivity("workspace_create", `Created workspace: ${trimmedName}`, {}, workspace.id);
  return { success: true, message: "Workspace created.", workspace };
}

/**
 * Update a workspace. Only owners and admins.
 */
export async function updateWorkspace(
  workspaceId: string,
  updates: { name?: string; description?: string }
): Promise<WorkspaceActionResponse & { workspace?: Workspace }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Check membership + role
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { success: false, message: "Workspace not found or access denied.", error: "NOT_FOUND" };
  }

  if (!hasMinimumRole(membership.role as Role, "admin")) {
    return { success: false, message: "Only owners and admins can update workspaces.", error: "FORBIDDEN" };
  }

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 100) {
      return { success: false, message: "Workspace name must be 1-100 characters.", error: "INVALID_NAME" };
    }
    dbUpdates.name = trimmed;
  }
  if (updates.description !== undefined) {
    dbUpdates.description = updates.description.trim();
  }

  if (Object.keys(dbUpdates).length === 0) {
    return { success: false, message: "No valid fields to update.", error: "NO_UPDATES" };
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .update(dbUpdates)
    .eq("id", workspaceId)
    .select()
    .single();

  if (error || !workspace) {
    logger.error("Failed to update workspace", { workspaceId, reason: error?.message });
    return { success: false, message: "Failed to update workspace.", error: "UPDATE_FAILED" };
  }

  logger.info("Workspace updated", { workspaceId });
  await logActivity("workspace_update", `Updated workspace: ${workspace.name}`, {}, workspaceId);
  return { success: true, message: "Workspace updated.", workspace };
}

/**
 * Delete a workspace. Only owners.
 */
export async function deleteWorkspace(
  workspaceId: string
): Promise<WorkspaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership || membership.role !== "owner") {
    return { success: false, message: "Only owners can delete workspaces.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", workspaceId);

  if (error) {
    logger.error("Failed to delete workspace", { workspaceId, reason: error.message });
    return { success: false, message: "Failed to delete workspace.", error: "DELETE_FAILED" };
  }

  logger.info("Workspace deleted", { workspaceId });
  await logActivity("workspace_delete", `Deleted workspace: ${workspaceId}`, {}, workspaceId);
  revalidatePath("/dashboard");
  return { success: true, message: "Workspace deleted." };
}

/**
 * Switch the active workspace for the current user.
 */
export async function switchActiveWorkspace(
  workspaceId: string
): Promise<WorkspaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { success: false, message: "You are not a member of this workspace.", error: "NOT_MEMBER" };
  }

  const { error } = await supabase
    .from("user_settings")
    .update({ active_workspace_id: workspaceId })
    .eq("user_id", profile.id);

  if (error) {
    logger.error("Failed to switch active workspace", {
      userId: profile.id,
      reason: error.message,
    });
    return { success: false, message: "Failed to switch workspace.", error: "UPDATE_FAILED" };
  }

  revalidatePath("/dashboard");
  return { success: true, message: "Active workspace switched." };
}

/**
 * Get all members of a workspace with profile info.
 */
export async function getWorkspaceMembers(
  workspaceId: string
): Promise<MemberWithProfile[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify caller is a member
  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!callerMembership) {
    return [];
  }

  const { data: members } = await supabase
    .from("workspace_members")
    .select("*, profiles(full_name, avatar_url)")
    .eq("workspace_id", workspaceId);

  return (members ?? []).map((m) => ({
    ...m,
    full_name: (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
    avatar_url: (m.profiles as { avatar_url: string | null } | null)?.avatar_url ?? null,
  }));
}

/**
 * Update a member's role. Only owner/admin can change roles.
 * Admin cannot promote to owner.
 */
export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  newRole: string
): Promise<WorkspaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Check caller role
  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!callerMembership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(callerMembership.role as Role, "admin")) {
    return { success: false, message: "Only owners and admins can change member roles.", error: "FORBIDDEN" };
  }

  // Check target member
  const { data: targetMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (!targetMembership) {
    return { success: false, message: "Member not found.", error: "NOT_FOUND" };
  }

  if (targetMembership.role === "owner") {
    return { success: false, message: "Cannot change the role of the workspace owner.", error: "FORBIDDEN" };
  }

  // Admin cannot promote to owner
  if (callerMembership.role === "admin" && newRole === "owner") {
    return { success: false, message: "Admins cannot promote members to owner.", error: "FORBIDDEN" };
  }

  const validRoles: Role[] = ["owner", "admin", "member", "guest"];
  if (!validRoles.includes(newRole as Role)) {
    return { success: false, message: "Invalid role.", error: "INVALID_ROLE" };
  }

  const { error } = await supabase
    .from("workspace_members")
    .update({ role: newRole as WorkspaceMember["role"] })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error) {
    logger.error("Failed to update member role", {
      workspaceId,
      userId,
      reason: error.message,
    });
    return { success: false, message: "Failed to update member role.", error: "UPDATE_FAILED" };
  }

  logger.info("Member role updated", { workspaceId, userId, newRole });
  await logActivity("member_role_change", `Changed ${userId} role to ${newRole}`, { newRole }, workspaceId);
  return { success: true, message: "Member role updated." };
}

/**
 * Remove a member from the workspace. Only owner/admin.
 */
export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<WorkspaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!callerMembership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(callerMembership.role as Role, "admin")) {
    return { success: false, message: "Only owners and admins can remove members.", error: "FORBIDDEN" };
  }

  // Check target member
  const { data: targetMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (!targetMembership) {
    return { success: false, message: "Member not found.", error: "NOT_FOUND" };
  }

  if (targetMembership.role === "owner") {
    return { success: false, message: "Cannot remove the workspace owner.", error: "FORBIDDEN" };
  }

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error) {
    logger.error("Failed to remove member", {
      workspaceId,
      userId,
      reason: error.message,
    });
    return { success: false, message: "Failed to remove member.", error: "REMOVE_FAILED" };
  }

  logger.info("Member removed", { workspaceId, userId });
  await logActivity("member_leave", `Removed member ${userId}`, {}, workspaceId);
  return { success: true, message: "Member removed." };
}

/**
 * Invite a member to the workspace. Only owner/admin.
 */
export async function inviteMember(
  workspaceId: string,
  email: string,
  role: string
): Promise<WorkspaceActionResponse & { invitation?: WorkspaceInvitation }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!callerMembership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(callerMembership.role as Role, "admin")) {
    return { success: false, message: "Only owners and admins can invite members.", error: "FORBIDDEN" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, message: "Invalid email address.", error: "INVALID_EMAIL" };
  }

  const validRoles: Role[] = ["owner", "admin", "member", "guest"];
  if (!validRoles.includes(role as Role)) {
    return { success: false, message: "Invalid role.", error: "INVALID_ROLE" };
  }

  const { data: invitation, error } = await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: workspaceId,
      email: email.trim().toLowerCase(),
      invited_by: profile.id,
      role: role as WorkspaceInvitation["role"],
      status: "pending",
    })
    .select()
    .single();

  if (error || !invitation) {
    logger.error("Failed to create invitation", {
      workspaceId,
      email,
      reason: error?.message,
    });
    return { success: false, message: "Failed to create invitation.", error: "CREATE_FAILED" };
  }

  logger.info("Member invited", { workspaceId, email, role });
  await logActivity("invitation_send", `Invited ${email} as ${role}`, { email, role }, workspaceId);
  return { success: true, message: "Invitation sent.", invitation };
}

/**
 * Get pending invitations for a workspace. Only owner/admin.
 */
export async function getInvitations(
  workspaceId: string
): Promise<WorkspaceInvitation[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!callerMembership || !hasMinimumRole(callerMembership.role as Role, "admin")) {
    return [];
  }

  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");

  if (error) {
    logger.error("Failed to fetch invitations", {
      workspaceId,
      reason: error.message,
    });
    return [];
  }

  return data ?? [];
}

/**
 * Get the user's active workspace ID from user_settings.
 * If null, get their default (first) workspace.
 */
export async function getActiveWorkspaceId(): Promise<string | null> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Ensure settings exist
  const settings = await ensureUserSettings(profile.id);

  if (settings.active_workspace_id) {
    // Verify the user is still a member
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", settings.active_workspace_id)
      .eq("user_id", profile.id)
      .single();

    if (membership) return settings.active_workspace_id;
  }

  // Fall back to first workspace
  const { data: firstMember } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", profile.id)
    .limit(1)
    .single();

  return firstMember?.workspace_id ?? null;
}
