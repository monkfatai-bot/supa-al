/**
 * Supa AI — Phase 9 Workspace knowledge base service.
 *
 * Owns the `knowledge_base` table — workspace-curated articles that the
 * AI assistant grounds its answers in (see `ai-assistant.ts`).
 *
 * @module @/lib/workspace/knowledge-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  CreateKnowledgeArticleInput,
  KnowledgeArticle,
  ListKnowledgeOptions,
  UpdateKnowledgeArticleInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  toJson,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

class KnowledgeService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /** Paginated list of knowledge articles. */
  async list(
    workspaceId: string,
    userId: string,
    opts: ListKnowledgeOptions = {},
  ): Promise<KnowledgeArticle[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);

      let query = this.supabase
        .from("knowledge_base")
        .select()
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.sourceType) {
        query = query.eq("source_type", opts.sourceType);
      }
      if (opts.tag) {
        query = query.contains("tags", [opts.tag]);
      }
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "knowledge.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing knowledge articles.", {
        workspaceId,
      });
    }
  }

  /** Fetch a single knowledge article. */
  async get(
    workspaceId: string,
    userId: string,
    articleId: string,
  ): Promise<KnowledgeArticle> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("knowledge_base")
        .select()
        .eq("id", articleId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) throw toDbError(error, "knowledge.get failed");
      if (!data) throw new NotFoundError("Knowledge article", articleId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching knowledge article.", {
        articleId,
      });
    }
  }

  /** Create a knowledge article. */
  async create(
    workspaceId: string,
    userId: string,
    input: CreateKnowledgeArticleInput,
  ): Promise<KnowledgeArticle> {
    const title = input.title?.trim();
    if (!title) {
      throw new ValidationError("Knowledge article title is required.");
    }
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("knowledge_base")
        .insert({
          workspace_id: workspaceId,
          title,
          content: input.content ?? null,
          source: input.source ?? null,
          source_type: input.sourceType ?? "manual",
          tags: input.tags ?? [],
          metadata: toJson(input.metadata ?? null),
        } as never)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "knowledge.create failed");
      if (!data) throw new NotFoundError("Knowledge create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating knowledge article.", {
        workspaceId,
      });
    }
  }

  /** Update a knowledge article. */
  async update(
    workspaceId: string,
    userId: string,
    articleId: string,
    input: UpdateKnowledgeArticleInput,
  ): Promise<KnowledgeArticle> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (!trimmed) {
        throw new ValidationError("Title cannot be empty.");
      }
      patch.title = trimmed;
    }
    if (input.content !== undefined) patch.content = input.content;
    if (input.source !== undefined) patch.source = input.source;
    if (input.sourceType !== undefined) patch.source_type = input.sourceType;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.metadata !== undefined) patch.metadata = toJson(input.metadata);

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("knowledge_base")
        .update(patch as never)
        .eq("id", articleId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();

      if (error) throw toDbError(error, "knowledge.update failed");
      if (!data) throw new NotFoundError("Knowledge article", articleId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating knowledge article.", {
        articleId,
      });
    }
  }

  /** Hard-delete a knowledge article. */
  async delete(
    workspaceId: string,
    userId: string,
    articleId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { error } = await this.supabase
        .from("knowledge_base")
        .delete()
        .eq("id", articleId)
        .eq("workspace_id", workspaceId);

      if (error) throw toDbError(error, "knowledge.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting knowledge article.", {
        articleId,
      });
    }
  }
}

export async function createKnowledgeService(): Promise<KnowledgeService> {
  const supabase = await createSupabaseServerClient();
  return new KnowledgeService(supabase);
}

export { KnowledgeService };
