/**
 * Supa AI — Phase 9 Workspace service.
 *
 * Owns the `workspaces` + `workspace_members` + `workspace_invitations`
 * tables. CRUD for workspaces, member management, invitations, and the
 * workspace dashboard aggregate.
 *
 * Constructed with the **server** Supabase client (RLS-enforced). The
 * `is_workspace_member()` SQL function (defined in migration 0009) backs
 * every RLS policy on every workspace-scoped table, so the caller's
 * membership is enforced at the database layer in addition to the
 * `assertMember` checks in this service.
 *
 * @module @/lib/workspace/workspace-service
 */
import "server-only";

import { randomUUID } from "node:crypto";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CreateWorkspaceInput,
  InviteMemberInput,
  ListWorkspacesOptions,
  UpdateMemberInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceActivity,
  WorkspaceDashboard,
  WorkspaceInvitation,
  WorkspaceMember,
} from "./types";
import {
  ADMIN_ROLES,
  assertCanAdmin,
  assertMember,
  slugify,
  toDbError,
  toJson,
  wrapUnexpected,
} from "./core";
import { NotFoundError, ValidationError } from "@/lib/errors";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const DEFAULT_ACTIVITY_LIMIT = 10;
const DEFAULT_RECENT_DOCS_LIMIT = 5;
const DEFAULT_INVITATION_EXPIRY_DAYS = 7;

class WorkspaceService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  // -----------------------------------------------------------------------
  // Workspace CRUD
  // -----------------------------------------------------------------------

  /** List workspaces the caller is a member of. */
  async list(
    userId: string,
    opts: ListWorkspacesOptions = {},
  ): Promise<Workspace[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);
    const includeArchived = opts.includeArchived ?? false;

    try {
      // RLS on `workspaces` allows the caller to see only their own workspaces
      // (owner_id = auth.uid()) or workspaces where they are an active member.
      // The server client propagates the caller's auth, so this query is safe.
      let query = this.supabase
        .from("workspaces")
        .select()
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!includeArchived) {
        query = query.eq("is_archived", false);
      }
      if (opts.type) {
        query = query.eq("type", opts.type);
      }
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "workspaces.list failed");
      // Defense-in-depth: filter to workspaces the caller actually owns or is
      // a member of. RLS already does this; the extra filter protects against
      // any future drift in the policy.
      const owned = (data ?? []).filter(
        (w) => w.owner_id === userId,
      );
      return owned;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing workspaces.", {
        userId,
      });
    }
  }

  /** Fetch a single workspace. Throws when the caller is not a member. */
  async get(workspaceId: string, userId: string): Promise<Workspace> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("workspaces")
        .select()
        .eq("id", workspaceId)
        .maybeSingle();

      if (error) throw toDbError(error, "workspaces.get failed");
      if (!data) throw new NotFoundError("Workspace", workspaceId);
      return data;
    } catch (err) {
      if (
        err instanceof NotFoundError ||
        err instanceof ValidationError
      ) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching workspace.", {
        workspaceId,
      });
    }
  }

  /** Create a new workspace owned by the caller. The owner is auto-added as a member. */
  async create(
    userId: string,
    input: CreateWorkspaceInput,
  ): Promise<Workspace> {
    const name = input.name?.trim();
    if (!name) {
      throw new ValidationError("Workspace name is required.");
    }
    const slug = (input.slug?.trim() || slugify(name)).toLowerCase();

    try {
      const insert = {
        name,
        slug,
        description: input.description ?? null,
        logo_url: input.logoUrl ?? null,
        type: input.type ?? "team",
        owner_id: userId,
        billing_owner_id: userId,
        settings: toJson(input.settings ?? {}),
        storage_used_bytes: 0,
        ai_credits_pool: 0,
        is_archived: false,
      };

      const { data, error } = await this.supabase
        .from("workspaces")
        .insert(insert as never)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "workspaces.create failed");
      if (!data) {
        throw new NotFoundError("Workspace create returned no row.");
      }

      // Owner is auto-enrolled as a member with the 'owner' role. RLS allows
      // self-insert (the policy accepts `user_id = auth.uid()`).
      const { error: memberError } = await this.supabase
        .from("workspace_members")
        .insert({
          workspace_id: data.id,
          user_id: userId,
          role: "owner",
          status: "active",
          invited_by: userId,
          joined_at: new Date().toISOString(),
        } as never);

      if (memberError) {
        // Best-effort rollback: delete the half-created workspace.
        await this.supabase.from("workspaces").delete().eq("id", data.id);
        throw toDbError(
          memberError,
          "workspaces.create member enrollment failed",
        );
      }

      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating workspace.", {
        userId,
      });
    }
  }

  /** Update workspace metadata. Admin-only. */
  async update(
    workspaceId: string,
    userId: string,
    input: UpdateWorkspaceInput,
  ): Promise<Workspace> {
    await assertCanAdmin(this.supabase, workspaceId, userId);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.slug !== undefined) {
      patch.slug = input.slug.trim().toLowerCase();
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
    if (input.type !== undefined) patch.type = input.type;
    if (input.settings !== undefined) patch.settings = toJson(input.settings);
    if (input.isArchived !== undefined) patch.is_archived = input.isArchived;
    if (input.aiCreditsPool !== undefined) {
      patch.ai_credits_pool = input.aiCreditsPool;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("workspaces")
        .update(patch as never)
        .eq("id", workspaceId)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "workspaces.update failed");
      if (!data) throw new NotFoundError("Workspace", workspaceId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating workspace.", {
        workspaceId,
      });
    }
  }

  /** Hard-delete a workspace. Owner-only. Cascades to all child rows. */
  async delete(workspaceId: string, userId: string): Promise<void> {
    try {
      const membership = await assertMember(this.supabase, workspaceId, userId);
      if (membership.role !== "owner") {
        throw new ValidationError("Only the workspace owner may delete it.");
      }

      const { error } = await this.supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId)
        .eq("owner_id", userId);

      if (error) throw toDbError(error, "workspaces.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting workspace.", {
        workspaceId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Members
  // -----------------------------------------------------------------------

  /** List members of a workspace. */
  async getMembers(
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

      if (error) throw toDbError(error, "workspaces.getMembers failed");
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

  /**
   * Invite a new member by email. Creates an invitation row with a
   * random opaque token (the recipient redeems it via a future
   * `/api/workspace/invitations/:token/accept` route). Admin-only.
   */
  async inviteMember(
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
    if (!ADMIN_ROLES.includes(role) && role !== "editor" && role !== "viewer" && role !== "member") {
      throw new ValidationError(`Unknown role "${role}".`);
    }

    try {
      const invitation = {
        workspace_id: workspaceId,
        email,
        role,
        token: randomUUID(),
        invited_by: userId,
        expires_at: new Date(
          Date.now() + DEFAULT_INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      const { data, error } = await this.supabase
        .from("workspace_invitations")
        .insert(invitation as never)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "workspaces.inviteMember failed");
      if (!data) {
        throw new NotFoundError("Invitation create returned no row.");
      }
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

  /** List pending invitations for a workspace. */
  async listInvitations(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceInvitation[]> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("workspace_invitations")
        .select()
        .eq("workspace_id", workspaceId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw toDbError(error, "workspaces.listInvitations failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing invitations.", {
        workspaceId,
      });
    }
  }

  /** Remove a member from a workspace. Admin-only. */
  async removeMember(
    workspaceId: string,
    userId: string,
    memberId: string,
  ): Promise<void> {
    try {
      const adminMembership = await assertCanAdmin(
        this.supabase,
        workspaceId,
        userId,
      );

      const { data: target, error: fetchErr } = await this.supabase
        .from("workspace_members")
        .select()
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (fetchErr) throw toDbError(fetchErr, "workspaces.removeMember lookup failed");
      if (!target) throw new NotFoundError("Workspace member", memberId);

      // Cannot remove the workspace owner.
      if (target.role === "owner") {
        throw new ValidationError("Cannot remove the workspace owner.");
      }
      // An admin cannot remove another admin (only the owner can).
      if (
        target.role === "admin" &&
        adminMembership.role !== "owner"
      ) {
        throw new ValidationError("Only the owner can remove an admin.");
      }

      const { error } = await this.supabase
        .from("workspace_members")
        .delete()
        .eq("id", memberId)
        .eq("workspace_id", workspaceId);

      if (error) throw toDbError(error, "workspaces.removeMember failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure removing member.", {
        workspaceId,
        memberId,
      });
    }
  }

  /** Update a member's role / status. Admin-only. */
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<WorkspaceMember> {
    try {
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

      const { data: target, error: fetchErr } = await this.supabase
        .from("workspace_members")
        .select()
        .eq("id", memberId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (fetchErr) throw toDbError(fetchErr, "workspaces.updateMemberRole lookup failed");
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

      if (error) throw toDbError(error, "workspaces.updateMemberRole failed");
      if (!data) throw new NotFoundError("Workspace member", memberId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating member.", {
        workspaceId,
        memberId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Dashboard aggregate
  // -----------------------------------------------------------------------

  /**
   * Compose a workspace dashboard snapshot: counts (members, documents,
   * folders, files, knowledge, comments, unread mentions), storage used,
   * AI credits, recent activity, and recent documents.
   */
  async getDashboard(workspaceId: string, userId: string): Promise<WorkspaceDashboard> {
    try {
      const workspace = await this.get(workspaceId, userId);

      const [
        membersRes,
        documentsRes,
        foldersRes,
        filesRes,
        knowledgeRes,
        commentsRes,
        mentionsRes,
        activityRes,
        recentDocsRes,
      ] = await Promise.all([
        this.supabase
          .from("workspace_members")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", "active"),
        this.supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId),
        this.supabase
          .from("folders")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId),
        this.supabase
          .from("file_library")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId),
        this.supabase
          .from("knowledge_base")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId),
        this.supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId),
        this.supabase
          .from("workspace_mentions")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("mentioned_user_id", userId)
          .eq("is_read", false),
        this.supabase
          .from("workspace_activity")
          .select()
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(DEFAULT_ACTIVITY_LIMIT),
        this.supabase
          .from("documents")
          .select()
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(DEFAULT_RECENT_DOCS_LIMIT),
      ]);

      // Throw on the first error we hit.
      const firstError =
        membersRes.error ??
        documentsRes.error ??
        foldersRes.error ??
        filesRes.error ??
        knowledgeRes.error ??
        commentsRes.error ??
        mentionsRes.error ??
        activityRes.error ??
        recentDocsRes.error;
      if (firstError) {
        throw toDbError(firstError, "workspaces.getDashboard counts failed");
      }

      const recentActivity = (activityRes.data ?? []) as WorkspaceActivity[];

      return {
        workspace,
        memberCount: membersRes.count ?? 0,
        documentCount: documentsRes.count ?? 0,
        folderCount: foldersRes.count ?? 0,
        fileCount: filesRes.count ?? 0,
        knowledgeCount: knowledgeRes.count ?? 0,
        commentCount: commentsRes.count ?? 0,
        unreadMentionCount: mentionsRes.count ?? 0,
        storageUsedBytes: workspace.storage_used_bytes,
        aiCreditsPool: workspace.ai_credits_pool,
        recentActivity,
        recentDocuments: recentDocsRes.data ?? [],
      };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(
        err,
        "Unexpected failure building workspace dashboard.",
        { workspaceId },
      );
    }
  }
}

/**
 * Build the canonical {@link WorkspaceService} for use in Route Handlers
 * and Server Components. The caller's auth session is propagated; only
 * their own workspaces / memberships are visible/mutable (RLS-enforced).
 */
export async function createWorkspaceService(): Promise<WorkspaceService> {
  const supabase = await createSupabaseServerClient();
  return new WorkspaceService(supabase);
}

/**
 * Build an admin {@link WorkspaceService} that bypasses RLS. Use only for
 * system operations (back-office, migrations, support tooling).
 */
export function createWorkspaceServiceAdmin(
  supabase: AnySupabaseClient,
): WorkspaceService {
  return new WorkspaceService(supabase);
}

export { WorkspaceService };
