/**
 * Video storage service.
 * Handles uploads, downloads, signed URLs, and cleanup for Supabase Storage.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { logger } from "@/services/logger";

const VIDEO_BUCKET = "video-uploads";

/** Supported video MIME types for upload. */
const SUPPORTED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

/** Supported image MIME types for image-to-video. */
const SUPPORTED_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

/** Maximum video file size: 500 MB. */
const MAX_VIDEO_SIZE_BYTES = 524_288_000;

/** Maximum image file size for i2v: 20 MB. */
const MAX_IMAGE_SIZE_BYTES = 20_971_520;

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

/** Validate an uploaded file (video or image for i2v). */
export function validateVideoUpload(
  _fileName: string,
  mimeType: string,
  sizeBytes: number,
  isImageInput: boolean
): UploadValidationResult {
  const allowedMimes = isImageInput ? SUPPORTED_IMAGE_MIMES : SUPPORTED_VIDEO_MIMES;
  const maxSize = isImageInput ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;

  if (!allowedMimes.has(mimeType)) {
    return {
      valid: false,
      error: `Unsupported file type: ${mimeType}. Allowed: ${[...allowedMimes].join(", ")}`,
    };
  }

  if (sizeBytes > maxSize) {
    const maxMB = Math.round(maxSize / 1_048_576);
    return {
      valid: false,
      error: `File too large: ${Math.round(sizeBytes / 1_048_576)}MB exceeds ${maxMB}MB limit`,
    };
  }

  if (sizeBytes === 0) {
    return { valid: false, error: "Empty file" };
  }

  return { valid: true };
}

/** Upload a file to the video-uploads bucket. */
export async function uploadVideoFile(
  userId: string,
  folder: string,
  fileName: string,
  fileData: ArrayBuffer | Uint8Array | Buffer,
  contentType: string
): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const storagePath = `${userId}/${folder}/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(storagePath, fileData, {
      contentType,
      upsert: false,
    });

  if (error) {
    logger.error("Video upload failed", { userId, storagePath, error: error.message });
    throw new Error(`Upload failed: ${error.message}`);
  }

  logger.info("Video file uploaded", { userId, storagePath });
  return storagePath;
}

/** Generate a signed URL for a stored video or image. */
export async function getSignedVideoUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    logger.warn("Failed to create signed URL", { storagePath, error: error?.message });
    return "";
  }

  return data.signedUrl;
}

/** Generate signed URLs for multiple files. */
export async function getSignedVideoUrls(
  paths: string[],
  expiresInSeconds: number = 3600
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  await Promise.all(
    paths.map(async (path) => {
      const url = await getSignedVideoUrl(path, expiresInSeconds);
      if (url) result.set(path, url);
    })
  );

  return result;
}

/** Delete a file from storage. */
export async function deleteVideoFile(storagePath: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .remove([storagePath]);

  if (error) {
    logger.warn("Failed to delete video file", { storagePath, error: error.message });
  }
}

/** Delete multiple files from storage. */
export async function deleteVideoFiles(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .remove(storagePaths);

  if (error) {
    logger.warn("Failed to delete video files", { count: storagePaths.length, error: error.message });
  }
}

/** Download a video from a URL and upload to Supabase Storage. */
export async function downloadAndStoreVideo(
  userId: string,
  folder: string,
  videoUrl: string,
  fileName: string
): Promise<string> {
  const resp = await fetch(videoUrl);
  if (!resp.ok) {
    throw new Error(`Failed to download video: ${resp.status}`);
  }

  const buffer = await resp.arrayBuffer();
  const contentType = resp.headers.get("content-type") ?? "video/mp4";

  const storagePath = await uploadVideoFile(userId, folder, fileName, buffer, contentType);
  return storagePath;
}

/** Download a thumbnail from a URL and upload to Supabase Storage. */
export async function downloadAndStoreThumbnail(
  userId: string,
  thumbnailUrl: string,
  generationId: string
): Promise<string> {
  if (!thumbnailUrl) return "";

  try {
    const resp = await fetch(thumbnailUrl);
    if (!resp.ok) return "";

    const buffer = await resp.arrayBuffer();
    const fileName = `thumbnail-${generationId}.jpg`;
    return await uploadVideoFile(userId, "thumbnails", fileName, buffer, "image/jpeg");
  } catch {
    logger.warn("Failed to download thumbnail", { thumbnailUrl });
    return "";
  }
}
