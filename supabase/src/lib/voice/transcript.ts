/**
 * Supa AI — Voice transcript service (Phase 8).
 *
 * Owns the `voice_transcripts` table for STT / translate operations.
 * Provides CRUD and a `getForGeneration` lookup. Constructed with the
 * admin Supabase client so writes succeed before the `workspaces` table
 * ships in Phase 9A.
 *
 * @module @/lib/voice/transcript
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import type { VoiceTranscript, VoiceTranscriptInsert } from "./types";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class TranscriptService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /** Create a new transcript row. */
  async create(input: VoiceTranscriptInsert): Promise<VoiceTranscript> {
    try {
      const { data, error } = await this.supabase
        .from("voice_transcripts")
        .insert(input)
        .select()
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_transcripts.insert failed");
      if (!data) {
        throw new DatabaseError("voice_transcripts.insert returned no row.", {
          generationId: input.generation_id,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating transcript.", {
        cause: appErr.message,
      });
    }
  }

  /** Get a transcript by its generation id. Returns null when not found. */
  async getForGeneration(
    workspaceId: string,
    generationId: string,
  ): Promise<VoiceTranscript | null> {
    try {
      const { data, error } = await this.supabase
        .from("voice_transcripts")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("generation_id", generationId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_transcripts.getForGeneration failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading transcript.", {
        generationId,
        cause: appErr.message,
      });
    }
  }

  /** Get a single transcript by id. */
  async get(workspaceId: string, id: string): Promise<VoiceTranscript> {
    try {
      const { data, error } = await this.supabase
        .from("voice_transcripts")
        .select()
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_transcripts.get failed");
      if (!data) throw new NotFoundError("Voice transcript", id);
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading transcript.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /** List transcripts for the workspace (most-recent first). */
  async list(
    workspaceId: string,
    opts: {
      generationId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<VoiceTranscript[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      let query = this.supabase
        .from("voice_transcripts")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.generationId) query = query.eq("generation_id", opts.generationId);
      const { data, error } = await query;
      if (error) throw this.toDbError(error, "voice_transcripts.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing transcripts.", {
        workspaceId,
        cause: appErr.message,
      });
    }
  }

  /** Delete a transcript. */
  async delete(workspaceId: string, id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("voice_transcripts")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw this.toDbError(error, "voice_transcripts.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting transcript.", {
        id,
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

/** Build the canonical {@link TranscriptService}. */
export function createTranscriptService(): TranscriptService {
  const supabase = createSupabaseAdminClient();
  return new TranscriptService(supabase);
}
