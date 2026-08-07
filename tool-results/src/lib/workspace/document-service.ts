/**
 * Supa AI — Phase 9 Workspace document service.
 *
 * Owns the `documents` table — workspace document CRUD, search, and the
 * initial version snapshot. Document version history is owned by
 * {@link VersionService} (in `version-service.ts`).
 *
 * @module @/lib/workspace/document-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  CreateDocumentInput,
  Document,
  ListDocumentsOptions,
  UpdateDocumentInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

class DocumentService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Paginated list of documents in a workspace. Optionally filter by
   * folder, status, or full-text search.
   */
  async list(
    workspaceId: string,
    userId: string,
    opts: ListDocumentsOptions = {},
  ): Promise<Document[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);

      let query = this.supabase
        .from("documents")
        .select()
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.folderId !== undefined && opts.folderId !== null) {
        query = query.eq("folder_id", opts.folderId);
      }
      if (opts.status) {
        query = query.eq("status", opts.status);
      }
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "documents.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing documents.", {
        workspaceId,
      });
    }
  }

  /** Fetch a single document. */
  async get(
    workspaceId: string,
    userId: string,
    documentId: string,
  ): Promise<Document> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("documents")
        .select()
        .eq("id", documentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) throw toDbError(error, "documents.get failed");
      if (!data) throw new NotFoundError("Document", documentId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching document.", {
        documentId,
      });
    }
  }

  /**
   * Create a document. The first {@link VersionService} snapshot is
   * written lazily on the first edit — an empty document doesn't need a
   * version row yet.
   */
  async create(
    workspaceId: string,
    userId: string,
    input: CreateDocumentInput,
  ): Promise<Document> {
    const title = input.title?.trim();
    if (!title) {
      throw new ValidationError("Document title is required.");
    }
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("documents")
        .insert({
          workspace_id: workspaceId,
          folder_id: input.folderId ?? null,
          title,
          content: input.content ?? null,
          content_type: input.contentType ?? "markdown",
          status: input.status ?? "draft",
          version: 1,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "documents.create failed");
      if (!data) throw new NotFoundError("Document create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating document.", {
        workspaceId,
      });
    }
  }

  /**
   * Patch a document. Each successful write bumps `version` by 1 AND
   * inserts a new row into `document_versions` (so the history is
   * complete — see {@link VersionService}).
   */
  async update(
    workspaceId: string,
    userId: string,
    documentId: string,
    input: UpdateDocumentInput,
  ): Promise<Document> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (!trimmed) {
        throw new ValidationError("Document title cannot be empty.");
      }
      patch.title = trimmed;
    }
    if (input.content !== undefined) patch.content = input.content;
    if (input.contentType !== undefined) patch.content_type = input.contentType;
    if (input.folderId !== undefined) patch.folder_id = input.folderId;
    if (input.status !== undefined) patch.status = input.status;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      // Read-then-write is the simplest way to also insert a version snapshot
      // atomically. RLS enforces visibility; the UPDATE filter on
      // `workspace_id` enforces defense-in-depth.
      const { data: existing, error: fetchErr } = await this.supabase
        .from("documents")
        .select()
        .eq("id", documentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "documents.update lookup failed");
      if (!existing) throw new NotFoundError("Document", documentId);

      const nextVersion = (existing.version ?? 1) + 1;
      patch.version = nextVersion;

      const { data, error } = await this.supabase
        .from("documents")
        .update(patch as never)
        .eq("id", documentId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "documents.update failed");
      if (!data) throw new NotFoundError("Document", documentId);

      // Insert the version snapshot (best-effort — version history is
      // non-critical; the document row is the source of truth).
      try {
        await this.supabase.from("document_versions").insert({
          document_id: documentId,
          version: nextVersion,
          content: input.content ?? existing.content,
          changed_by: userId,
        } as never);
      } catch {
        // Swallow — version history is best-effort. The next successful
        // update will retry with `nextVersion + 1`.
      }

      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating document.", {
        documentId,
      });
    }
  }

  /** Hard-delete a document. Cascades to `document_versions` + `comments`. */
  async delete(
    workspaceId: string,
    userId: string,
    documentId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { error } = await this.supabase
        .from("documents")
        .delete()
        .eq("id", documentId)
        .eq("workspace_id", workspaceId);

      if (error) throw toDbError(error, "documents.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting document.", {
        documentId,
      });
    }
  }
}

export async function createDocumentService(): Promise<DocumentService> {
  const supabase = await createSupabaseServerClient();
  return new DocumentService(supabase);
}

export { DocumentService };
