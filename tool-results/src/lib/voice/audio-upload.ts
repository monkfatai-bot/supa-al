/**
 * Supa AI — Audio upload service (Phase 8).
 *
 * Owns the `audio_uploads` table (Phase 8 schema). Bridges the voice
 * surface to Supabase Storage `ai-assets` bucket: validates, uploads,
 * persists metadata, and reads back. Constructed with the **admin**
 * Supabase client (RLS bypass — mirrors the Phase 9C employee service)
 * so writes succeed before the `workspaces` table ships in Phase 9A.
 *
 * @module @/lib/voice/audio-upload
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

import { createVoiceAudioStorage, type VoiceAudioStorage } from "./audio-storage";
import type { AudioUpload, AudioUploadInsert } from "./types";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class AudioUploadService {
  constructor(
    private readonly supabase: AdminSupabaseClient,
    private readonly storage: VoiceAudioStorage,
  ) {}

  /**
   * Upload an audio file (raw bytes from a multipart upload) and persist
   * the metadata row.
   */
  async upload(
    workspaceId: string,
    userId: string,
    file: { name: string; type: string; size: number; body: Blob | ArrayBuffer | ArrayBufferView },
  ): Promise<AudioUpload> {
    if (file.size <= 0) {
      throw new ValidationError("Uploaded file is empty.");
    }

    const result = await this.storage.uploadUserAudio(
      userId,
      file.body,
      file.type,
      file.name,
    );

    const insert: AudioUploadInsert = {
      workspace_id: workspaceId,
      user_id: userId,
      file_name: file.name,
      file_path: result.path,
      file_size: file.size,
      mime_type: file.type,
      duration: null,
      metadata: null,
    };

    try {
      const { data, error } = await this.supabase
        .from("audio_uploads")
        .insert(insert)
        .select()
        .maybeSingle();
      if (error) throw this.toDbError(error, "audio_uploads.insert failed");
      if (!data) {
        throw new DatabaseError("audio_uploads.insert returned no row.", {
          workspaceId,
          userId,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure uploading audio.", {
        workspaceId,
        cause: appErr.message,
      });
    }
  }

  /** Fetch a single upload by id, with workspace check. */
  async get(workspaceId: string, id: string): Promise<AudioUpload | null> {
    try {
      const { data, error } = await this.supabase
        .from("audio_uploads")
        .select()
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "audio_uploads.get failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading audio upload.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /** Resolve a single upload by id or throw {@link NotFoundError}. */
  async require(workspaceId: string, id: string): Promise<AudioUpload> {
    const row = await this.get(workspaceId, id);
    if (!row) throw new NotFoundError("Audio upload", id);
    return row;
  }

  /** List the workspace's audio uploads (most-recent first). */
  async list(
    workspaceId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<AudioUpload[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      const { data, error } = await this.supabase
        .from("audio_uploads")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw this.toDbError(error, "audio_uploads.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing audio uploads.", {
        workspaceId,
        cause: appErr.message,
      });
    }
  }

  /** Delete a single upload (DB row + storage object). */
  async delete(workspaceId: string, id: string): Promise<void> {
    const row = await this.require(workspaceId, id);
    await this.storage.delete(row.file_path);
    try {
      const { error } = await this.supabase
        .from("audio_uploads")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw this.toDbError(error, "audio_uploads.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting audio upload.", {
        id,
        cause: appErr.message,
      });
    }
  }

  /**
   * Download the raw audio bytes for an upload (used by the voice
   * service when calling STT/translate/dub/clone providers).
   */
  async downloadBytes(row: AudioUpload): Promise<ArrayBuffer> {
    const signed = await this.storage.getSignedUrl(row.file_path, 300);
    const res = await fetch(signed);
    if (!res.ok) {
      throw new DatabaseError("Failed to download audio bytes.", {
        status: res.status,
        path: row.file_path,
      });
    }
    return res.arrayBuffer();
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

/** Build the canonical {@link AudioUploadService}. */
export async function createAudioUploadService(): Promise<AudioUploadService> {
  const supabase = createSupabaseAdminClient();
  const storage = await createVoiceAudioStorage();
  return new AudioUploadService(supabase, storage);
}

/** Build an {@link AudioUploadService} with explicit dependencies (testing). */
export function makeAudioUploadService(
  supabase: AdminSupabaseClient,
  storage: VoiceAudioStorage,
): AudioUploadService {
  return new AudioUploadService(supabase, storage);
}
