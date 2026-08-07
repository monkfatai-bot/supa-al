/**
 * Supa AI — Phase 9 Workspace file library service.
 *
 * Owns the `file_library` table and the `workspace-files` storage bucket.
 * Upload, download (signed URL), delete, and analyze (best-effort
 * metadata extraction).
 *
 * @module @/lib/workspace/file-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  FileLibraryEntry,
  UploadFileInput,
  UploadedFile,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const STORAGE_BUCKET = "workspace-files";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

class FileService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /** List all files in a workspace (newest first). */
  async list(
    workspaceId: string,
    userId: string,
    folderId?: string | null,
  ): Promise<FileLibraryEntry[]> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      let query = this.supabase
        .from("file_library")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (folderId !== undefined && folderId !== null) {
        query = query.eq("folder_id", folderId);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "files.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing files.", {
        workspaceId,
      });
    }
  }

  /**
   * Upload a file to the workspace-files bucket and record it in
   * `file_library`. Returns the row + a 1-hour signed URL the client
   * can use to fetch the content.
   */
  async upload(
    workspaceId: string,
    userId: string,
    input: UploadFileInput,
  ): Promise<UploadedFile> {
    const fileName = input.fileName?.trim();
    if (!fileName) {
      throw new ValidationError("File name is required.");
    }
    await assertCanWrite(this.supabase, workspaceId, userId);

    const bytes = input.fileContent instanceof Blob
      ? await input.fileContent.arrayBuffer()
      : input.fileContent instanceof Uint8Array
        ? input.fileContent
        : new Uint8Array(input.fileContent);
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new ValidationError(
        `File is too large (max ${MAX_FILE_BYTES} bytes / 25 MB).`,
      );
    }

    // Bucket path: <workspace_id>/<uuid>/<filename> — uuid avoids collisions.
    const path = `${workspaceId}/${crypto.randomUUID()}/${fileName}`;

    try {
      const mimeType = input.mimeType ?? "application/octet-stream";

      const { error: uploadErr } = await this.supabase
        .storage
        .from(STORAGE_BUCKET)
        .upload(path, bytes, {
          contentType: mimeType,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadErr) {
        throw toDbError(
          {
            code: (uploadErr as { statusCode?: string }).statusCode,
            message: uploadErr.message,
            name: uploadErr.name,
          },
          "files.upload storage failed",
        );
      }

      const { data, error } = await this.supabase
        .from("file_library")
        .insert({
          workspace_id: workspaceId,
          folder_id: input.folderId ?? null,
          file_name: fileName,
          file_path: path,
          file_size: bytes.byteLength,
          mime_type: mimeType,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();

      if (error) {
        // Best-effort cleanup: remove the uploaded blob if the DB row failed.
        await this.supabase.storage.from(STORAGE_BUCKET).remove([path]);
        throw toDbError(error, "files.upload db failed");
      }
      if (!data) throw new NotFoundError("File upload returned no row.");

      const url = await this.signedUrl(path);
      return { file: data, url };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure uploading file.", {
        workspaceId,
        fileName,
      });
    }
  }

  /** Generate a signed download URL for a file. */
  async signedUrl(filePath: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

      if (error) {
        throw toDbError(
          {
            code: (error as { statusCode?: string }).statusCode,
            message: error.message,
            name: error.name,
          },
          "files.signedUrl failed",
        );
      }
      return data?.signedUrl ?? null;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating signed URL.", {
        filePath,
      });
    }
  }

  /**
   * Get a file row + a 1-hour signed URL. Throws {@link NotFoundError}
   * when the file does not exist (or is outside the caller's reach).
   */
  async getWithUrl(
    workspaceId: string,
    userId: string,
    fileId: string,
  ): Promise<UploadedFile> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("file_library")
        .select()
        .eq("id", fileId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) throw toDbError(error, "files.getWithUrl failed");
      if (!data) throw new NotFoundError("File", fileId);

      const url = await this.signedUrl(data.file_path);
      return { file: data, url };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching file.", {
        fileId,
      });
    }
  }

  /**
   * Delete a file. Removes the storage blob + the DB row. Writers only.
   */
  async delete(
    workspaceId: string,
    userId: string,
    fileId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data: existing, error: fetchErr } = await this.supabase
        .from("file_library")
        .select("file_path")
        .eq("id", fileId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "files.delete lookup failed");
      if (!existing) throw new NotFoundError("File", fileId);

      // Remove the blob first — if the DB delete fails, the orphaned row
      // is easier to clean up than an orphaned blob.
      await this.supabase.storage
        .from(STORAGE_BUCKET)
        .remove([existing.file_path]);

      const { error } = await this.supabase
        .from("file_library")
        .delete()
        .eq("id", fileId)
        .eq("workspace_id", workspaceId);

      if (error) throw toDbError(error, "files.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting file.", {
        fileId,
      });
    }
  }

  /**
   * Best-effort "analyze" — returns the file row + size + mime + signed URL.
   * Future phases can swap this for a real content-extraction pipeline
   * (PDF → text, image → OCR, etc.).
   */
  async analyze(
    workspaceId: string,
    userId: string,
    fileId: string,
  ): Promise<UploadedFile> {
    return this.getWithUrl(workspaceId, userId, fileId);
  }
}

export async function createFileService(): Promise<FileService> {
  const supabase = await createSupabaseServerClient();
  return new FileService(supabase);
}

export { FileService, STORAGE_BUCKET };
