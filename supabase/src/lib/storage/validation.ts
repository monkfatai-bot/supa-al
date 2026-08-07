/**
 * Supa AI — Upload validation + safe path generation.
 *
 * The canonical MIME allowlist and global size ceiling live in
 * `@/lib/constants/security` (owned by another agent). This module adds:
 *
 *   - Per-bucket overrides that mirror the storage bucket config in
 *     `supabase/migrations/0002_storage_buckets.sql` (so we surface friendly
 *     errors at the API layer instead of letting Supabase Storage reject the
 *     upload with a less informative message).
 *   - A safe-path generator that namespaces every object by `{user_id}/year/
 *     month/uuid/sanitized-filename`, which the storage RLS policies rely on
 *     for ownership checks.
 *
 * @module @/lib/storage/validation
 */
import { v4 as uuidv4 } from "uuid";

import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/constants/security";
import { ValidationError } from "@/lib/errors";

/** Bucket names managed by the platform. */
export type StorageBucket = "avatars" | "uploads" | "ai-assets";

/**
 * Per-bucket file constraints. These MUST stay in sync with the bucket
 * definitions in `supabase/migrations/0002_storage_buckets.sql`. If a future
 * migration changes a bucket's `file_size_limit` or `allowed_mime_types`,
 * update this map in the same PR.
 */
export const BUCKET_LIMITS: Readonly<
  Record<StorageBucket, { maxBytes: number; mimeTypes: readonly string[] }>
> = Object.freeze({
  avatars: {
    maxBytes: 2 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  uploads: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/plain",
      "text/csv",
      "text/markdown",
      "application/json",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
  "ai-assets": {
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "audio/mpeg",
      "audio/wav",
      "audio/webm",
      "video/mp4",
      "video/webm",
      "application/pdf",
      "application/json",
      "text/plain",
    ],
  },
});

/** Minimal structural shape for a file we need to validate. */
export interface UploadableFile {
  name: string;
  type: string;
  size: number;
}

/**
 * Validate an upload against the global allowlist AND the target bucket's
 * stricter constraints.
 *
 * @throws {ValidationError} if the MIME type or size is not allowed, or if
 *   the bucket is unknown.
 */
export function validateUpload(
  file: UploadableFile,
  bucket: StorageBucket,
): void {
  const limits = BUCKET_LIMITS[bucket];
  if (!limits) {
    throw new ValidationError(`Unknown storage bucket: "${bucket}".`, {
      bucket,
    });
  }

  // 1. MIME must be in the global allowlist (defense in depth even if the
  //    bucket's allowlist is wider).
  const globalAllowed = (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(
    file.type,
  );
  if (!globalAllowed) {
    throw new ValidationError(
      `MIME type "${file.type}" is not permitted for uploads.`,
      { mimeType: file.type, bucket },
    );
  }

  // 2. MIME must also be in the bucket's allowlist.
  if (!limits.mimeTypes.includes(file.type)) {
    throw new ValidationError(
      `MIME type "${file.type}" is not permitted in bucket "${bucket}".`,
      { mimeType: file.type, bucket, allowed: limits.mimeTypes },
    );
  }

  // 3. Size must be under both the global ceiling and the bucket's limit
  //    (whichever is tighter).
  const maxBytes = Math.min(limits.maxBytes, MAX_UPLOAD_SIZE_BYTES);
  if (file.size <= 0) {
    throw new ValidationError("Uploaded file is empty.", { bucket });
  }
  if (file.size > maxBytes) {
    throw new ValidationError(
      `File size ${file.size} bytes exceeds the ${maxBytes} byte limit for bucket "${bucket}".`,
      { size: file.size, maxBytes, bucket },
    );
  }
}

/**
 * Strip characters that are unsafe in a storage path: path separators, null
 * bytes, control characters, and shell metacharacters. Preserves unicode
 * letters / digits / dashes / underscores / dots.
 */
function sanitizeFilename(filename: string): string {
  // Take only the basename (no nested paths from the client).
  const base = filename.split(/[/\\]/).pop() ?? filename;
  // Replace any character that isn't a letter, digit, dash, underscore, or
  // dot with a single dash.
  const cleaned = base
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : "file";
}

/**
 * Build a safe, namespaced storage path for an upload.
 *
 * Format: `{userId}/{yyyy}/{mm}/{uuid}/{sanitized-filename}`
 *
 * The leading `{userId}` segment is REQUIRED by the storage RLS policies in
 * `0002_storage_buckets.sql` — they extract it via `storage.foldername(name)`
 * to authorize the owner. Do not change this layout without updating the
 * policies.
 *
 * @param userId The authenticated user's id (must be a valid UUID).
 * @param filename The original filename from the client.
 */
export function buildStoragePath(userId: string, filename: string): string {
  if (!userId) {
    throw new ValidationError("Cannot build storage path: missing user id.");
  }
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const id = uuidv4();
  const safeName = sanitizeFilename(filename);
  return `${userId}/${yyyy}/${mm}/${id}/${safeName}`;
}
