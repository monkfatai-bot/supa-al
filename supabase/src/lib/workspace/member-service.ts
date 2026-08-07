/**
 * Supa AI — Phase 9 Workspace member service.
 *
 * Thin service over `workspace_members` + `workspace_invitations`. The
 * workspace-ownership + transfer-ownership logic stays in
 * {@link WorkspaceService}; this module focuses on the member list,
 * invitations, role updates, and removal.
 *
 * @module @/lib/workspace/member-service
 */
import "server-only";

import { randomUUID } from "node:crypto";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  InviteMemberInput,
  UpdateMemberInput,
  WorkspaceInvitation,
  WorkspaceMember,
} from "./types";
import {
  ADMIN_ROLES,
  assertCanAdmin,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_INVITATION_EXPIRY_DAYS = 7;

class MemberService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /** List members of a workspace (active + invited). */
  async list(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember[]> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("workspace_members")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });

      if (error) throw toDbError(error, "members.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing members.", {
        workspaceId,
      });
    }
  }

  /** Invite a new member by email. */
  async invite(
    workspaceId: string,
    userId: string,
    input: InviteMemberInput,
  ): Promise<WorkspaceInvitation> {
    await assertCanAdmin(this.supabase, workspaceId, userId);

    const email = input.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError("A valid email is required.");
    }
    const role = input.role ?? "member";
    const allowed: readonly string[] = ADMIN_ROLES;
    if (
      !allowed.includes(role) &&
      role !== "editor" &&
      role !== "viewer" &&
      role !== "member"
    ) {
      throw new ValidationError(`Unknown role "${role}".`);
    }

    try {
      const { data, error } = await this.supabase
        .from("workspace_invitations")
        .insert({
          workspace_id: workspaceId,
          email,
          role,
          token: randomUUID(),
          invited_by: userId,
          expires_at: new Date(
            Date.now() + DEFAULT_INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        } as never)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "members.invite failed");
      if (!data) throw new NotFoundError("Invitation create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure inviting member.", {
        workspaceId,
        email,
      });
    }
  }

  /** Remove a member from a workspace. */
  async remove(
    workspaceId: string,
    userId: string,
    memberId: string,
  ): Promise<void> {
    const adminMembership = await assertCanAdmin(
      this.supabase,
      workspaceId,
      userId,
    );

    try {
      const { data: target, error: fetchErr } = await this.supabase
        .from("workspace_members")
        .select()
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "members.remove lookup failed");
      if (!target) throw new NotFoundError("Workspace member", memberId);

      if (target.role === "owner") {
        throw new ValidationError("Cannot remove the workspace owner.");
      }
      if (target.role === "admin" && adminMembership.role !== "owner") {
        throw new ValidationError("Only the owner can remove an admin.");
      }

      const { error } = await this.supabase
        .from("workspace_members")
        .delete()
        .eq("id", memberId)
        .eq("workspace_id", workspaceId);

      if (error) throw toDbError(error, "members.remove failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure removing member.", {
        memberId,
      });
    }
  }

  /** Update a member's role / status. */
  async update(
    workspaceId: string,
    userId: string,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<WorkspaceMember> {
    const adminMembership = await assertCanAdmin(
      this.supabase,
      workspaceId,
      userId,
    );

    const patch: Record<string, unknown> = {};
    if (input.role !== undefined) {
      if (input.role === "owner") {
        throw new ValidationError(
          "Use the transfer-ownership flow to change the workspace owner.",
        );
      }
      patch.role = input.role;
    }
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for member update.");
    }

    try {
      const { data: target, error: fetchErr } = await this.supabase
        .from("workspace_members")
        .select()
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "members.update lookup failed");
      if (!target) throw new NotFoundError("Workspace member", memberId);

      if (target.role === "owner" && adminMembership.role !== "owner") {
        throw new ValidationError("Cannot modify the workspace owner.");
      }

      const { data, error } = await this.supabase
        .from("workspace_members")
        .update(patch as never)
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "members.update failed");
      if (!data) throw new NotFoundError("Workspace member", memberId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating member.", {
        memberId,
      });
    }
  }
}

export async function createMemberService(): Promise<MemberService> {
  const supabase = await createSupabaseServerClient();
  return new MemberService(supabase);
}

export { MemberService };
