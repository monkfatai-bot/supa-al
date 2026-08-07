/**
 * Supa AI — Phase 9 Workspace global search service.
 *
 * Federated search across documents, knowledge_base, file_library, and
 * folders in a workspace. Returns grouped results so the UI can render
 * a single global-search modal with sections per kind.
 *
 * @module @/lib/workspace/search-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  WorkspaceSearchOptions,
  WorkspaceSearchResult,
} from "./types";
import {
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

class SearchService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Run a federated search across documents, knowledge_base,
   * file_library, and folders. Each kind is queried in parallel and
   * capped at `limit` (default 10, max 25) results.
   */
  async search(
    workspaceId: string,
    userId: string,
    opts: WorkspaceSearchOptions,
  ): Promise<WorkspaceSearchResult> {
    const q = opts.query?.trim();
    if (!q) {
      throw new ValidationError("Search query is required.");
    }
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    );
    const kinds = opts.kinds ?? ["documents", "knowledge", "files", "folders"];

    try {
      await assertMember(this.supabase, workspaceId, userId);

      // Escape special characters so the `ilike` patterns are literal.
      const term = q.replace(/[%_]/g, (m) => `\\${m}`);

      const promises: Array<Promise<Partial<WorkspaceSearchResult>>> = [];

      if (kinds.includes("documents")) {
        promises.push(
          (async () => {
            const { data, error } = await this.supabase
              .from("documents")
              .select()
              .eq("workspace_id", workspaceId)
              .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
              .order("updated_at", { ascending: false })
              .limit(limit);
            if (error) throw toDbError(error, "search.documents failed");
            return { documents: data ?? [] };
          })(),
        );
      }
      if (kinds.includes("knowledge")) {
        promises.push(
          (async () => {
            const { data, error } = await this.supabase
              .from("knowledge_base")
              .select()
              .eq("workspace_id", workspaceId)
              .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
              .order("updated_at", { ascending: false })
              .limit(limit);
            if (error) throw toDbError(error, "search.knowledge failed");
            return { knowledge: data ?? [] };
          })(),
        );
      }
      if (kinds.includes("files")) {
        promises.push(
          (async () => {
            const { data, error } = await this.supabase
              .from("file_library")
              .select()
              .eq("workspace_id", workspaceId)
              .ilike("file_name", `%${term}%`)
              .order("created_at", { ascending: false })
              .limit(limit);
            if (error) throw toDbError(error, "search.files failed");
            return { files: data ?? [] };
          })(),
        );
      }
      if (kinds.includes("folders")) {
        promises.push(
          (async () => {
            const { data, error } = await this.supabase
              .from("folders")
              .select()
              .eq("workspace_id", workspaceId)
              .ilike("name", `%${term}%`)
              .order("name", { ascending: true })
              .limit(limit);
            if (error) throw toDbError(error, "search.folders failed");
            return { folders: data ?? [] };
          })(),
        );
      }

      const results = await Promise.all(promises);
      const merged: WorkspaceSearchResult = {
        documents: [],
        knowledge: [],
        files: [],
        folders: [],
      };
      for (const r of results) {
        if (r.documents) merged.documents = r.documents;
        if (r.knowledge) merged.knowledge = r.knowledge;
        if (r.files) merged.files = r.files;
        if (r.folders) merged.folders = r.folders;
      }
      return merged;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure searching workspace.", {
        workspaceId,
      });
    }
  }
}

export async function createSearchService(): Promise<SearchService> {
  const supabase = await createSupabaseServerClient();
  return new SearchService(supabase);
}

export { SearchService };
