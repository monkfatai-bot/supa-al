/**
 * Supa AI — Voice profile service (Phase 8).
 *
 * Owns the `voice_profiles` table (saved voice configurations + cloned
 * voices). Provides CRUD and helpers for listing cloned voices. Uses
 * the admin Supabase client so writes succeed before the `workspaces`
 * table ships in Phase 9A.
 *
 * @module @/lib/voice/profile
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import type {
  VoiceProfile,
  VoiceProfileInsert,
  VoiceProfileUpdate,
} from "./types";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export class ProfileService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /** Create a new voice profile. */
  async create(input: VoiceProfileInsert): Promise<VoiceProfile> {
    if (!input.name?.trim()) {
      throw new ValidationError("Voice profile name is required.");
    }
    try {
      const { data, error } = await this.supabase
        .from("voice_profiles")
        .insert(input)
        .select()
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_profiles.insert failed");
      if (!data) {
        throw new DatabaseError("voice_profiles.insert returned no row.", {
          workspaceId: input.workspace_id,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating voice profile.", {
        cause: appErr.message,
      });
    }
  }

  /** Patch an existing voice profile. */
  async update(
    workspaceId: string,
    id: string,
    patch: VoiceProfileUpdate,
  ): Promise<VoiceProfile> {
    try {
      const { data, error } = await this.supabase
        .from("voice_profiles")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_profiles.update failed");
      if (!data) throw new NotFoundError("Voice profile", id);
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating voice profile.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /** Get a single profile. */
  async get(workspaceId: string, id: string): Promise<VoiceProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from("voice_profiles")
        .select()
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "voice_profiles.get failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading voice profile.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /** List voice profiles for the workspace (most-recent first). */
  async list(
    workspaceId: string,
    opts: {
      provider?: string;
      isCloned?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<VoiceProfile[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      let query = this.supabase
        .from("voice_profiles")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.provider) query = query.eq("provider", opts.provider);
      if (typeof opts.isCloned === "boolean") query = query.eq("is_cloned", opts.isCloned);
      const { data, error } = await query;
      if (error) throw this.toDbError(error, "voice_profiles.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing voice profiles.", {
        workspaceId,
        cause: appErr.message,
      });
    }
  }

  /** List only cloned voice profiles for the workspace. */
  async listCloned(workspaceId: string): Promise<VoiceProfile[]> {
    return this.list(workspaceId, { isCloned: true });
  }

  /** Delete a voice profile (and remove the cloned voice from the provider
   *  via the registered provider client — best-effort). */
  async delete(workspaceId: string, id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("voice_profiles")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw this.toDbError(error, "voice_profiles.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting voice profile.", {
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

/** Build the canonical {@link ProfileService}. */
export function createProfileService(): ProfileService {
  const supabase = createSupabaseAdminClient();
  return new ProfileService(supabase);
}
