/**
 * Supa AI — Phase 5 AI Video — storage helpers.
 *
 * Wraps the platform {@link StorageService} for the video surface. The
 * `ai-assets` bucket is reused (its MIME allowlist already accepts
 * `video/mp4` and `video/webm`). Two responsibilities:
 *
 *   1. `uploadResult(userId, blob, fileName, contentType)` — persist a
 *      finished video to object storage, returning the storage path +
 *      public URL (signed when private). Used by the job queue when a
 *      provider returns a temporary result URL that we want to cache.
 *   2. `getSignedUrl(path)` — issue a short-lived signed URL for a
 *      stored result so the UI can play it back.
 *
 * @module @/lib/video/storage
 */
import "server-only";

import { v4 as uuidv4 } from "uuid";

import { StorageError } from "@/lib/errors";
import { createStorage, type StorageService, type UploadResult } from "@/lib/storage";

/** Bucket used for both source uploads and generated results. */
const BUCKET = "ai-assets" as const;

export class VideoStorageService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Upload a generated video to object storage. The path is namespaced
   * by `{userId}/video/{yyyy}/{mm}/{uuid}/{filename}` so the bucket's
   * RLS policies (which key on the leading `{userId}` segment) authorize
   * the owner.
   */
  async uploadResult(
    userId: string,
    body: Blob | ArrayBuffer | ArrayBufferView,
    fileName: string,
    contentType: string,
  ): Promise<UploadResult> {
    const safeName = this.sanitize(fileName);
    const now = new Date();
    const yyyy = now.getUTCFullYear().toString();
    const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
    const id = uuidv4();
    const path = `${userId}/video/${yyyy}/${mm}/${id}/${safeName}`;

    return this.storage.upload(
      BUCKET,
      userId,
      {
        name: safeName,
        type: contentType,
        size: this.byteLength(body),
        body,
      },
      { contentType, upsert: false },
    );
  }

  /** Issue a signed URL for a stored result. */
  async getSignedUrl(path: string, ttlSeconds = 300): Promise<string> {
    const { url } = await this.storage.getSignedUrl(BUCKET, path, ttlSeconds);
    return url;
  }

  /** Delete a stored result. Best-effort — never throws. */
  async delete(path: string): Promise<void> {
    try {
      await this.storage.delete(BUCKET, path);
    } catch {
      // Best-effort cleanup; logged inside StorageService.
    }
  }

  /** Strip unsafe characters from a client-provided filename. */
  private sanitize(filename: string): string {
    const base = filename.split(/[/\\]/).pop() ?? filename;
    const cleaned = base
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200);
    return cleaned.length > 0 ? cleaned : "video.mp4";
  }

  /** Compute the byte length of an upload body. */
  private byteLength(body: Blob | ArrayBuffer | ArrayBufferView): number {
    if (typeof Blob !== "undefined" && body instanceof Blob) return body.size;
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    return 0;
  }
}

/** Build the canonical {@link VideoStorageService}. */
export async function createVideoStorageService(): Promise<VideoStorageService> {
  const storage = await createStorage();
  return new VideoStorageService(storage);
}

export { StorageError };
