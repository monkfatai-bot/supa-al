/**
 * Supa AI — Typed Supabase Storage service.
 *
 * A small, typed wrapper around the Supabase Storage API that:
 *   - Translates every storage error into a {@link StorageError} so callers
 *     get a uniform error contract across the platform.
 *   - Enforces the safe-path + bucket-validation contract before any bytes
 *     hit the wire.
 *   - Returns typed results (no `any`) so downstream code is fully typed.
 *
 * The class is constructed with a Supabase client (server or admin); use the
 * {@link createStorage} factory for the canonical server-side instance.
 *
 * @module @/lib/storage
 */
import "server-only";

import type { FileObject, FileOptions, SearchOptions, StorageError as SupabaseStorageError } from "@supabase/storage-js";

import { DatabaseError, StorageError, toAppError } from "@/lib/errors";
import { createSupabaseServerClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import {
  BUCKET_LIMITS,
  buildStoragePath,
  validateUpload,
  type StorageBucket,
  type UploadableFile,
} from "@/lib/storage/validation";

/** Body shapes accepted by `StorageService.upload`. */
export type UploadBody = Blob | ArrayBuffer | ArrayBufferView;

/** Result of an `upload` operation. */
export interface UploadResult {
  path: string;
  bucket: StorageBucket;
  /** MIME type stored alongside the object (if Supabase reports it back). */
  mimeType: string | null;
  /** Object size in bytes (if Supabase reports it back). */
  size: number | null;
  /** Public URL for the object (only meaningful for public buckets). */
  publicUrl: string | null;
}

/** Result of a signed-URL request. */
export interface SignedUrlResult {
  url: string;
  expiresAt: Date;
}

/** Configuration for the {@link StorageService} constructor. */
export interface StorageServiceConfig {
  /**
   * Override the default signed-URL TTL (60s). Use a longer TTL for
   * long-lived downloads (e.g. exports), shorter for one-shot reads.
   */
  defaultSignedUrlTtlSeconds?: number;
}

/**
 * Service object encapsulating all storage operations. Stateless apart from
 * the injected Supabase client.
 */
export class StorageService {
  private readonly supabase: ServerSupabaseClient;
  private readonly defaultTtlSeconds: number;

  constructor(
    supabase: ServerSupabaseClient,
    config: StorageServiceConfig = {},
  ) {
    this.supabase = supabase;
    this.defaultTtlSeconds = config.defaultSignedUrlTtlSeconds ?? 60;
  }

  /**
   * Upload a file to a bucket. The body may be a `Blob`, `ArrayBuffer`, or
   * any `ArrayBufferView` (covers Node `Buffer` / `Uint8Array`). The caller
   * is responsible for providing the authenticated `userId` — it becomes
   * the first segment of the storage path used by the bucket's RLS policy.
   *
   * @returns The storage path (suitable for persisting in a `files` row)
   *   plus the object's public URL if the bucket is public.
   */
  async upload(
    bucket: StorageBucket,
    userId: string,
    file: UploadableFile & { body: UploadBody },
    opts: { contentType?: string; upsert?: boolean; cacheControl?: string } = {},
  ): Promise<UploadResult> {
    validateUpload(file, bucket);

    const path = buildStoragePath(userId, file.name);

    const fileOptions: FileOptions = {
      contentType: opts.contentType ?? file.type,
      upsert: opts.upsert ?? false,
      cacheControl: opts.cacheControl ?? "3600",
    };

    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(path, file.body, fileOptions);

      if (error) {
        throw this.toStorageError(error, `upload to "${bucket}" failed`, {
          bucket,
          path,
        });
      }

      const publicUrl =
        BUCKET_LIMITS[bucket] && bucket === "avatars"
          ? this.getPublicUrl(bucket, path).url
          : null;

      return {
        path: data?.path ?? path,
        bucket,
        // Supabase's upload response does not echo back MIME / size; use the
        // values from the inbound UploadableFile so callers can persist them
        // in a `files` row without a second roundtrip.
        mimeType: file.type ?? null,
        size: file.size,
        publicUrl,
      };
    } catch (err) {
      if (err instanceof StorageError) throw err;
      const appErr = toAppError(err);
      if (appErr.code === "STORAGE_ERROR") throw appErr;
      throw new StorageError(`upload to "${bucket}" failed unexpectedly.`, {
        bucket,
        path,
        cause: appErr.message,
      });
    }
  }

  /**
   * Generate a short-lived signed URL for reading a private object. The
   * caller must have read access to the object (RLS applies).
   *
   * @param expiresIn TTL in seconds (default 60).
   */
  async getSignedUrl(
    bucket: StorageBucket,
    path: string,
    expiresIn: number = this.defaultTtlSeconds,
  ): Promise<SignedUrlResult> {
    if (expiresIn <= 0 || expiresIn > 7 * 24 * 60 * 60) {
      throw new StorageError(
        `Invalid signed-URL TTL: ${expiresIn}s. Must be between 1 and 604800.`,
        { bucket, path, expiresIn },
      );
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error) {
        throw this.toStorageError(
          error,
          `createSignedUrl on "${bucket}" failed`,
          { bucket, path, expiresIn },
        );
      }
      if (!data?.signedUrl) {
        throw new StorageError(
          `Supabase returned no signed URL for "${bucket}/${path}".`,
          { bucket, path },
        );
      }

      return {
        url: data.signedUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `createSignedUrl on "${bucket}" failed unexpectedly.`,
        { bucket, path, cause: (err as Error)?.message },
      );
    }
  }

  /**
   * Return the public URL for an object in a public bucket. Note that for
   * private buckets this URL exists but will return 400/403 when fetched —
   * use {@link getSignedUrl} for private objects.
   */
  getPublicUrl(bucket: StorageBucket, path: string): {
    url: string;
  } {
    try {
      const { data } = this.supabase.storage
        .from(bucket)
        .getPublicUrl(path);
      return { url: data.publicUrl };
    } catch (err) {
      throw new StorageError(
        `getPublicUrl on "${bucket}" failed unexpectedly.`,
        { bucket, path, cause: (err as Error)?.message },
      );
    }
  }

  /**
   * Delete a single object. Returns silently if the object did not exist.
   */
  async delete(bucket: StorageBucket, path: string): Promise<void> {
    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        throw this.toStorageError(error, `delete on "${bucket}" failed`, {
          bucket,
          path,
        });
      }
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `delete on "${bucket}" failed unexpectedly.`,
        { bucket, path, cause: (err as Error)?.message },
      );
    }
  }

  /**
   * List objects under a prefix. Returns the raw `FileObject` array plus
   * pagination metadata.
   *
   * @param path Optional folder prefix (omit to list the bucket root).
   */
  async list(
    bucket: StorageBucket,
    path?: string,
    opts: SearchOptions = {},
  ): Promise<{
    items: FileObject[];
    hasMore: boolean;
  }> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .list(path, opts);

      if (error) {
        throw this.toStorageError(error, `list on "${bucket}" failed`, {
          bucket,
          path,
        });
      }

      const items: FileObject[] = data ?? [];
      // The Supabase list API doesn't return a cursor; `hasMore` is true iff
      // we got exactly `limit` items (default 100).
      const limit = opts.limit ?? 100;
      return { items, hasMore: items.length >= limit };
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `list on "${bucket}" failed unexpectedly.`,
        { bucket, path, cause: (err as Error)?.message },
      );
    }
  }

  /**
   * Map a Supabase `StorageError` (or any error shape returned by the SDK)
   * into our {@link StorageError}.
   */
  private toStorageError(
    error: SupabaseStorageError | { message?: string; name?: string },
    message: string,
    details: Record<string, unknown> = {},
  ): StorageError {
    return new StorageError(message, {
      ...details,
      errorName: error?.name,
      errorMessage: error?.message,
    });
  }
}

/**
 * Build the canonical server-side `StorageService`. Uses the server Supabase
 * client so RLS is enforced (the caller's auth session is propagated).
 *
 * Throws a {@link DatabaseError} if the underlying Supabase client cannot be
 * constructed.
 */
export async function createStorage(
  config?: StorageServiceConfig,
): Promise<StorageService> {
  try {
    const supabase = await createSupabaseServerClient();
    return new StorageService(supabase, config);
  } catch (err) {
    throw new DatabaseError(
      "Failed to construct server Supabase client for StorageService.",
      { cause: (err as Error)?.message },
    );
  }
}
