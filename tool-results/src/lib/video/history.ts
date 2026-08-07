/**
 * Supa AI — Phase 5 AI Video — history service.
 *
 * Thin read-layer over the `video_generations` table for the gallery +
 * history list. Filters by status, provider, type, or full-text search
 * over the prompt; returns the caller's own rows only (RLS reinforces
 * this at the query layer via the `eq('user_id')` filter — defense in
 * depth).
 *
 * @module @/lib/video/history
 */
import "server-only";

import {
  DatabaseError,
  toAppError,
} from "@/lib/errors";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ListVideoOptions, VideoGeneration } from "./types";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class VideoHistoryService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Paginated list of the caller's video generations, newest first.
   *
   * Filters:
   *   - `status` — exact match.
   *   - `provider` — exact match.
   *   - `type` — exact match.
   *   - `search` — ILIKE on the prompt (case-insensitive substring).
   */
  async list(
    userId: string,
    opts: ListVideoOptions = {},
  ): Promise<VideoGeneration[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      let query = this.supabase
        .from("video_generations")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.provider) query = query.eq("provider", opts.provider);
      if (opts.type) query = query.eq("type", opts.type);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.ilike("prompt", `%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw this.toDbError(error, "video.history.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing video generations.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /** Fetch a single generation by id (ownership enforced via RLS). */
  async get(
    userId: string,
    generationId: string,
  ): Promise<VideoGeneration | null> {
    try {
      const { data, error } = await this.supabase
        .from("video_generations")
        .select()
        .eq("id", generationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw this.toDbError(error, "video.history.get failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading video generation.", {
        userId,
        generationId,
        cause: appErr.message,
      });
    }
  }

  private toDbError(
    error: { code?: string; message?: string; name?: string; details?: unknown },
    message: string,
  ): DatabaseError {
    return new DatabaseError(message, {
      errorCode: error.code,
      errorName: error.name,
      errorMessage: error.message,
      errorDetails: error.details,
    });
  }
}

/** Build the canonical {@link VideoHistoryService} for use in API routes. */
export async function createVideoHistoryService(): Promise<VideoHistoryService> {
  const supabase = await createSupabaseServerClient();
  return new VideoHistoryService(supabase);
}
