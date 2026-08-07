/**
 * Supa AI — Voice history service (Phase 8).
 *
 * Owns the `voice_generations` table for the voice surface. Provides
 * list, get, update, and delete. Constructed with the admin Supabase
 * client so writes succeed before the `workspaces` table ships in
 * Phase 9A.
 *
 * @module @/lib/voice/history
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import type {
  VoiceGeneration,
  VoiceGenerationInsert,
  VoiceGenerationUpdate,
  VoiceGenerationWithRelations,
} from "./types";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class HistoryService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /** Create a new generation row. */
  async create(input: VoiceGenerationInsert): Promise<VoiceGeneration> {
    try {
      const { data, error } = await this.supabase
        .from("voice_generations")
        .insert(input)
        .select()
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_generations.insert failed");
      if (!data) {
        throw new DatabaseError("voice_generations.insert returned no row.", {
          workspaceId: input.workspace_id,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating generation.", {
        cause: appErr.message,
      });
    }
  }

  /** Patch an existing generation row. */
  async update(
    workspaceId: string,
    id: string,
    patch: VoiceGenerationUpdate,
  ): Promise<VoiceGeneration> {
    try {
      const { data, error } = await this.supabase
        .from("voice_generations")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_generations.update failed");
      if (!data) throw new NotFoundError("Voice generation", id);
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating generation.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /** Get a single generation row. Returns null when not found. */
  async get(workspaceId: string, id: string): Promise<VoiceGeneration | null> {
    try {
      const { data, error } = await this.supabase
        .from("voice_generations")
        .select()
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_generations.get failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading generation.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /** Get a generation with its transcript + job relations. */
  async getWithRelations(
    workspaceId: string,
    id: string,
  ): Promise<VoiceGenerationWithRelations | null> {
    const generation = await this.get(workspaceId, id);
    if (!generation) return null;

    let transcript: VoiceGenerationWithRelations["transcript"] = null;
    let job: VoiceGenerationWithRelations["job"] = null;
    try {
      const { data: tData } = await this.supabase
        .from("voice_transcripts")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("generation_id", id)
        .maybeSingle();
      transcript = tData ?? null;
    } catch {
      transcript = null;
    }
    try {
      const { data: jData } = await this.supabase
        .from("voice_jobs")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("generation_id", id)
        .maybeSingle();
      job = jData ?? null;
    } catch {
      job = null;
    }
    return { ...generation, transcript, job };
  }

  /** List generations for the workspace (most-recent first). */
  async list(
    workspaceId: string,
    opts: {
      type?: string;
      provider?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<VoiceGeneration[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      let query = this.supabase
        .from("voice_generations")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.type) query = query.eq("type", opts.type as never);
      if (opts.provider) query = query.eq("provider", opts.provider);
      if (opts.status) query = query.eq("status", opts.status as never);
      const { data, error } = await query;
      if (error) throw this.toDbError(error, "voice_generations.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing generations.", {
        workspaceId,
        cause: appErr.message,
      });
    }
  }

  /** Delete a generation. */
  async delete(workspaceId: string, id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("voice_generations")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw this.toDbError(error, "voice_generations.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting generation.", {
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

/** Build the canonical {@link HistoryService}. */
export function createHistoryService(): HistoryService {
  const supabase = createSupabaseAdminClient();
  return new HistoryService(supabase);
}
