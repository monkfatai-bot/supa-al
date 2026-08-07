/**
 * Supa AI — Phase 9 Workspace document version history service.
 *
 * Owns the `document_versions` table — immutable history snapshots for
 * every successful document write. {@link DocumentService.update} writes
 * a snapshot per edit; this service exposes the read path.
 *
 * @module @/lib/workspace/version-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { DocumentVersion } from "./types";
import { assertMember, toDbError, wrapUnexpected } from "./core";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

class VersionService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /** Paginated list of a document's version history, newest first. */
  async list(
    workspaceId: string,
    userId: string,
    documentId: string,
    limit?: number,
    offset?: number,
  ): Promise<DocumentVersion[]> {
    const safeLimit = Math.max(1, Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    const safeOffset = Math.max(0, offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("document_versions")
        .select()
        .eq("document_id", documentId)
        .order("version", { ascending: false })
        .range(safeOffset, safeOffset + safeLimit - 1);

      if (error) throw toDbError(error, "versions.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing versions.", {
        documentId,
      });
    }
  }

  /** Fetch a specific version. */
  async get(
    workspaceId: string,
    userId: string,
    documentId: string,
    version: number,
  ): Promise<DocumentVersion> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("document_versions")
        .select()
        .eq("document_id", documentId)
        .eq("version", version)
        .maybeSingle();

      if (error) throw toDbError(error, "versions.get failed");
      if (!data) {
        throw new NotFoundError("Document version", `${documentId}@${version}`);
      }
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching version.", {
        documentId,
        version,
      });
    }
  }
}

export async function createVersionService(): Promise<VersionService> {
  const supabase = await createSupabaseServerClient();
  return new VersionService(supabase);
}

export { VersionService };
