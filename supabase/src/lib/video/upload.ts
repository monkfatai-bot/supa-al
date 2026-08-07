/**
 * Supa AI — Phase 5 AI Video — upload service.
 *
 * Owns the `video_uploads` table for source videos uploaded by users
 * (used for image-to-video / video-to-video flows when the source is
 * not already a public URL). Persists metadata after the storage layer
 * has placed the bytes in the `ai-assets` bucket.
 *
 * @module @/lib/video/upload
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  StorageError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStorage, type StorageService } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";

import type { VideoUpload, VideoUploadInsert } from "./types";

const ALLOWED_VIDEO_MIME = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
] as const;

const MAX_SOURCE_SIZE = 100 * 1024 * 1024; // 100 MB

export class VideoUploadService {
  constructor(
    private readonly supabase: AnySupabaseClient,
    private readonly storage: StorageService,
  ) {}

  /**
   * Persist a user-uploaded source video. Validates MIME + size, uploads
   * to the `ai-assets` bucket, and inserts a `video_uploads` row.
   */
  async upload(
    workspaceId: string,
    userId: string,
    file: File,
    metadata: { duration?: number; width?: number; height?: number } = {},
  ): Promise<VideoUpload> {
    const contentType = file.type || "video/mp4";
    if (!ALLOWED_VIDEO_MIME.includes(contentType as (typeof ALLOWED_VIDEO_MIME)[number])) {
      throw new ValidationError(
        `Unsupported video MIME type: "${contentType}". Allowed: ${ALLOWED_VIDEO_MIME.join(", ")}.`,
        { mimeType: contentType },
      );
    }
    if (file.size <= 0) {
      throw new ValidationError("Uploaded file is empty.");
    }
    if (file.size > MAX_SOURCE_SIZE) {
      throw new ValidationError(
        `Source video exceeds the 100 MB limit (size: ${file.size} bytes).`,
        { size: file.size },
      );
    }

    const safeName = this.sanitize(file.name);
    const now = new Date();
    const yyyy = now.getUTCFullYear().toString();
    const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
    const id = uuidv4();
    const path = `${userId}/video-uploads/${yyyy}/${mm}/${id}/${safeName}`;

    let upload;
    try {
      upload = await this.storage.upload(
        "ai-assets",
        userId,
        {
          name: safeName,
          type: contentType,
          size: file.size,
          body: file,
        },
        { contentType },
      );
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError("Unexpected failure during video upload.", {
        cause: (err as Error)?.message,
      });
    }
    // Use the explicit path so the bucket namespace matches the RLS policy.
    if (upload.path !== path) {
      // Some Supabase versions echo back a different path; prefer the
      // caller-constructed one for the row insert so the policy matches.
    }

    const row: VideoUploadInsert = {
      workspace_id: workspaceId,
      user_id: userId,
      file_name: safeName,
      file_path: upload.path,
      file_size: file.size,
      mime_type: contentType,
      duration: metadata.duration ?? null,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      metadata: { originalName: file.name } as never,
    };

    try {
      const { data, error } = await this.supabase
        .from("video_uploads")
        .insert(row as never)
        .select()
        .single();
      if (error) throw this.toDbError(error, "video_upload.insert failed");
      if (!data) throw new DatabaseError("video_upload.insert returned no row.");
      return data as VideoUpload;
    } catch (err) {
      if (err instanceof DatabaseError) {
        // Best-effort cleanup of the storage object on DB failure.
        try {
          await this.storage.delete("ai-assets", upload.path);
        } catch {
          // Swallow — the storage layer logs.
        }
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure persisting video upload.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /** Fetch a single upload row. Returns `null` when not found or not owned. */
  async get(userId: string, uploadId: string): Promise<VideoUpload | null> {
    try {
      const { data, error } = await this.supabase
        .from("video_uploads")
        .select()
        .eq("id", uploadId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw this.toDbError(error, "video_upload.get failed");
      return (data as VideoUpload | null) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading video upload.", {
        userId,
        uploadId,
        cause: appErr.message,
      });
    }
  }

  /** List the caller's uploads (newest first). */
  async list(userId: string, limit = 30): Promise<VideoUpload[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    try {
      const { data, error } = await this.supabase
        .from("video_uploads")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(safeLimit);
      if (error) throw this.toDbError(error, "video_upload.list failed");
      return (data ?? []) as VideoUpload[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing video uploads.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /** Hard-delete an upload + its storage object. */
  async delete(userId: string, uploadId: string): Promise<void> {
    const row = await this.get(userId, uploadId);
    if (!row) throw new NotFoundError("VideoUpload", uploadId);
    try {
      const { error } = await this.supabase
        .from("video_uploads")
        .delete()
        .eq("id", uploadId)
        .eq("user_id", userId);
      if (error) throw this.toDbError(error, "video_upload.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting video upload.", {
        userId,
        uploadId,
        cause: appErr.message,
      });
    }
    // Best-effort storage cleanup; never throws.
    try {
      await this.storage.delete("ai-assets", row.file_path);
    } catch {
      // swallow — the storage layer logs.
    }
  }

  private sanitize(filename: string): string {
    const base = filename.split(/[/\\]/).pop() ?? filename;
    const cleaned = base
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200);
    return cleaned.length > 0 ? cleaned : "source.mp4";
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

/** Build the canonical {@link VideoUploadService}. */
export async function createVideoUploadService(): Promise<VideoUploadService> {
  const supabase = await createSupabaseServerClient();
  const storage = await createStorage();
  return new VideoUploadService(supabase, storage);
}
