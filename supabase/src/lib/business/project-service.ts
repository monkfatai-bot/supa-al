/**
 * Supa AI — Phase 10 project service (server-only).
 *
 * Owns the `projects` table. CRUD + progress updates. Projects can be
 * tied to a customer (`client_id`) and to a workspace member
 * (`manager_id`).
 *
 * @module @/lib/business/project-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class ProjectService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      status?: string;
      clientId?: string;
      managerId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Project[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("projects")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.clientId) query = query.eq("client_id", opts.clientId);
      if (opts.managerId) query = query.eq("manager_id", opts.managerId);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "projects.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing projects.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    projectId: string,
  ): Promise<Project> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("projects")
        .select()
        .eq("id", projectId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "projects.get failed");
      if (!data) throw new NotFoundError("Project", projectId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching project.", {
        projectId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateProjectInput,
  ): Promise<Project> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Project name is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("projects")
        .insert({
          workspace_id: workspaceId,
          name,
          description: input.description ?? null,
          status: input.status ?? "planning",
          start_date: input.startDate ?? null,
          end_date: input.endDate ?? null,
          budget: input.budget ?? 0,
          client_id: input.clientId ?? null,
          manager_id: input.managerId ?? null,
          team: (input.team ?? []) as never,
          progress: input.progress ?? 0,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "projects.create failed");
      if (!data) throw new NotFoundError("Project create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating project.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    if (input.startDate !== undefined) patch.start_date = input.startDate;
    if (input.endDate !== undefined) patch.end_date = input.endDate;
    if (input.budget !== undefined) patch.budget = input.budget;
    if (input.clientId !== undefined) patch.client_id = input.clientId;
    if (input.managerId !== undefined) patch.manager_id = input.managerId;
    if (input.team !== undefined) patch.team = input.team as never;
    if (input.progress !== undefined) {
      const clamped = Math.max(0, Math.min(100, Math.round(input.progress)));
      patch.progress = clamped;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("projects")
        .update(patch as never)
        .eq("id", projectId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "projects.update failed");
      if (!data) throw new NotFoundError("Project", projectId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating project.", {
        projectId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    projectId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("projects")
        .delete()
        .eq("id", projectId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "projects.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting project.", {
        projectId,
      });
    }
  }
}

export async function createProjectService(): Promise<ProjectService> {
  const supabase = await createSupabaseServerClient();
  return new ProjectService(supabase);
}
