/**
 * Audio storage service.
 * Handles uploads, downloads, signed URLs, and cleanup for Supabase Storage.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { logger } from "@/services/logger";

const AUDIO_BUCKET = "audio-uploads";

/** Supported audio MIME types for upload. */
const SUPPORTED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/x-matroska",
]);

/** Supported image MIME types for voice cloning samples. */
const SUPPORTED_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

/** Maximum audio file size: 500 MB. */
const MAX_AUDIO_SIZE_BYTES = 524_288_000;

/** Maximum image file size for cloning samples: 20 MB. */
const MAX_IMAGE_SIZE_BYTES = 20_971_520;

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

/** Validate an uploaded file (audio or image for cloning). */
export function validateAudioUpload(
  _fileName: string,
  mimeType: string,
  sizeBytes: number,
  isImageInput: boolean = false
): UploadValidationResult {
  const allowedMimes = isImageInput ? SUPPORTED_IMAGE_MIMES : SUPPORTED_AUDIO_MIMES;
  const maxSize = isImageInput ? MAX_IMAGE_SIZE_BYTES : MAX_AUDIO_SIZE_BYTES;

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

/** Upload a file to the audio-uploads bucket. */
export async function uploadAudioFile(
  userId: string,
  folder: string,
  fileName: string,
  fileData: ArrayBuffer | Uint8Array | Buffer,
  contentType: string
): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const storagePath = `${userId}/${folder}/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(storagePath, fileData, {
      contentType,
      upsert: false,
    });

  if (error) {
    logger.error("Audio upload failed", { userId, storagePath, error: error.message });
    throw new Error(`Upload failed: ${error.message}`);
  }

  logger.info("Audio file uploaded", { userId, storagePath });
  return storagePath;
}

/** Generate a signed URL for a stored audio file. */
export async function getSignedAudioUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    logger.warn("Failed to create signed URL", { storagePath, error: error?.message });
    return "";
  }

  return data.signedUrl;
}

/** Generate signed URLs for multiple files. */
export async function getSignedAudioUrls(
  paths: string[],
  expiresInSeconds: number = 3600
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  await Promise.all(
    paths.map(async (path) => {
      const url = await getSignedAudioUrl(path, expiresInSeconds);
      if (url) result.set(path, url);
    })
  );

  return result;
}

/** Delete a file from storage. */
export async function deleteAudioFile(storagePath: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .remove([storagePath]);

  if (error) {
    logger.warn("Failed to delete audio file", { storagePath, error: error.message });
  }
}

/** Delete multiple files from storage. */
export async function deleteAudioFiles(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .remove(storagePaths);

  if (error) {
    logger.warn("Failed to delete audio files", { count: storagePaths.length, error: error.message });
  }
}

/** Download audio from a URL and upload to Supabase Storage. */
export async function downloadAndStoreAudio(
  userId: string,
  folder: string,
  audioUrl: string,
  fileName: string
): Promise<string> {
  const resp = await fetch(audioUrl);
  if (!resp.ok) {
    throw new Error(`Failed to download audio: ${resp.status}`);
  }

  const buffer = await resp.arrayBuffer();
  const contentType = resp.headers.get("content-type") ?? "audio/mpeg";

  const storagePath = await uploadAudioFile(userId, folder, fileName, buffer, contentType);
  return storagePath;
}
