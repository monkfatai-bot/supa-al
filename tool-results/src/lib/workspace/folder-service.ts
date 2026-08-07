/**
 * Supa AI — Phase 9 Workspace folder service.
 *
 * Owns the `folders` table — workspace document tree. Operations: list,
 * create, rename, move, delete. Members can read; writers can mutate.
 *
 * @module @/lib/workspace/folder-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  CreateFolderInput,
  Folder,
  MoveFolderInput,
  RenameFolderInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

class FolderService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * List all folders in a workspace. Returns a flat list — the UI builds
   * the tree from `parent_id`.
   */
  async list(workspaceId: string, userId: string): Promise<Folder[]> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("folders")
        .select()
        .eq("workspace_id", workspaceId)
        .order("name", { ascending: true });

      if (error) throw toDbError(error, "folders.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing folders.", {
        workspaceId,
      });
    }
  }

  /** Create a folder. Optionally under a parent. */
  async create(
    workspaceId: string,
    userId: string,
    input: CreateFolderInput,
  ): Promise<Folder> {
    const name = input.name?.trim();
    if (!name) {
      throw new ValidationError("Folder name is required.");
    }
    await assertCanWrite(this.supabase, workspaceId, userId);

    let path = "/";
    if (input.parentId) {
      const { data: parent, error: parentErr } = await this.supabase
        .from("folders")
        .select()
        .eq("id", input.parentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (parentErr) throw toDbError(parentErr, "folders.create parent lookup failed");
      if (!parent) throw new NotFoundError("Parent folder", input.parentId);
      path = `${parent.path === "/" ? "" : parent.path}/${parent.id}`;
    }

    try {
      const { data, error } = await this.supabase
        .from("folders")
        .insert({
          workspace_id: workspaceId,
          parent_id: input.parentId ?? null,
          name,
          path,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "folders.create failed");
      if (!data) throw new NotFoundError("Folder create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating folder.", {
        workspaceId,
      });
    }
  }

  /** Rename a folder. */
  async rename(
    workspaceId: string,
    userId: string,
    folderId: string,
    input: RenameFolderInput,
  ): Promise<Folder> {
    const name = input.name?.trim();
    if (!name) {
      throw new ValidationError("Folder name is required.");
    }
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("folders")
        .update({ name } as never)
        .eq("id", folderId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "folders.rename failed");
      if (!data) throw new NotFoundError("Folder", folderId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure renaming folder.", {
        folderId,
      });
    }
  }

  /** Move a folder under a new parent (or to the root when `null`). */
  async move(
    workspaceId: string,
    userId: string,
    folderId: string,
    input: MoveFolderInput,
  ): Promise<Folder> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    let newPath = "/";
    if (input.parentId) {
      if (input.parentId === folderId) {
        throw new ValidationError("Cannot move a folder into itself.");
      }
      const { data: parent, error: parentErr } = await this.supabase
        .from("folders")
        .select()
        .eq("id", input.parentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (parentErr) throw toDbError(parentErr, "folders.move parent lookup failed");
      if (!parent) throw new NotFoundError("Parent folder", input.parentId);

      // Guard against moving a folder into one of its own descendants.
      if (parent.path.includes(`/${folderId}`)) {
        throw new ValidationError(
          "Cannot move a folder into one of its own descendants.",
        );
      }
      newPath = `${parent.path === "/" ? "" : parent.path}/${parent.id}`;
    }

    try {
      const { data, error } = await this.supabase
        .from("folders")
        .update({
          parent_id: input.parentId ?? null,
          path: newPath,
        } as never)
        .eq("id", folderId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "folders.move failed");
      if (!data) throw new NotFoundError("Folder", folderId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure moving folder.", {
        folderId,
      });
    }
  }

  /** Hard-delete a folder. Cascades to descendant folders (FK on delete cascade). */
  async delete(
    workspaceId: string,
    userId: string,
    folderId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { error } = await this.supabase
        .from("folders")
        .delete()
        .eq("id", folderId)
        .eq("workspace_id", workspaceId);

      if (error) throw toDbError(error, "folders.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting folder.", {
        folderId,
      });
    }
  }
}

export async function createFolderService(): Promise<FolderService> {
  const supabase = await createSupabaseServerClient();
  return new FolderService(supabase);
}

export { FolderService };
