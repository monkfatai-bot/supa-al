/**
 * Supa AI — Voice audio storage (Phase 8).
 *
 * Thin wrapper around {@link StorageService} for the `ai-assets` bucket
 * used by the voice platform. The underlying storage RLS policy requires
 * every object path to begin with the owning user's id (see
 * `0002_storage_buckets.sql`), so the {@link StorageService} builds the
 * path itself — this module just lifts + checks MIME types and produces
 * signed URLs for download.
 *
 * Server-only.
 *
 * @module @/lib/voice/audio-storage
 */
import "server-only";

import { StorageError } from "@/lib/errors";
import { createStorage, type StorageService, type UploadResult } from "@/lib/storage";

/** MIME types accepted by the voice platform's audio assets. */
export const VOICE_AUDIO_MIME_TYPES: readonly string[] = Object.freeze([
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
]);

/** Max upload size for audio assets (50MB, mirroring the `ai-assets` bucket). */
export const VOICE_AUDIO_MAX_BYTES = 50 * 1024 * 1024;

/** Body shapes accepted by `upload`. */
type AudioBody = Blob | ArrayBuffer | ArrayBufferView;

/**
 * Service object encapsulating all voice-specific storage operations.
 * Constructed with a {@link StorageService}; the canonical factory
 * {@link createVoiceAudioStorage} wires it with the RLS-enforced server
 * client.
 */
export class VoiceAudioStorage {
  constructor(private readonly storage: StorageService) {}

  /**
   * Upload generated audio (TTS / dub output) to the `ai-assets` bucket.
   * The path is built by {@link StorageService} — workspace-scoped
   * filtering happens at the DB layer (`voice_generations.workspace_id`)
   * while the storage path remains `{userId}/yyyy/mm/uuid/audio.ext`.
   */
  async uploadGenerated(
    userId: string,
    audio: AudioBody,
    mimeType: string,
    filename: string,
  ): Promise<UploadResult> {
    this.assertAudioMime(mimeType);
    const body = this.toBlob(audio, mimeType);
    return this.storage.upload(
      "ai-assets",
      userId,
      { name: filename, type: mimeType, size: body.size, body },
      { contentType: mimeType, upsert: false },
    );
  }

  /**
   * Upload a raw user-provided audio file (e.g. STT / cloning sample).
   * Same RLS convention as {@link uploadGenerated}: the path begins with
   * the owning user's id.
   */
  async uploadUserAudio(
    userId: string,
    audio: AudioBody,
    mimeType: string,
    filename: string,
  ): Promise<UploadResult> {
    return this.uploadGenerated(userId, audio, mimeType, filename);
  }

  /** Generate a short-lived signed URL for downloading an audio asset. */
  async getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
    const { url } = await this.storage.getSignedUrl("ai-assets", path, expiresIn);
    return url;
  }

  /** Delete a stored audio asset. Returns silently if not found. */
  async delete(path: string): Promise<void> {
    await this.storage.delete("ai-assets", path);
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private toBlob(audio: AudioBody, mimeType: string): Blob {
    if (audio instanceof Blob) return audio;
    if (audio instanceof ArrayBuffer) return new Blob([audio], { type: mimeType });
    // ArrayBufferView (covers Node Buffer / Uint8Array). Cast through
    // `unknown` first because TypeScript's ArrayBufferView generic in
    // newer lib.dom typings narrows in a way that conflicts with BlobPart.
    return new Blob([audio as unknown as BlobPart], { type: mimeType });
  }

  private assertAudioMime(mimeType: string): void {
    if (!VOICE_AUDIO_MIME_TYPES.includes(mimeType)) {
      throw new StorageError(
        `Unsupported audio MIME type "${mimeType}". Allowed: ${VOICE_AUDIO_MIME_TYPES.join(", ")}.`,
        { mimeType },
      );
    }
  }
}

/** Build the canonical {@link VoiceAudioStorage}. */
export async function createVoiceAudioStorage(
  storage?: StorageService,
): Promise<VoiceAudioStorage> {
  const svc = storage ?? (await createStorage());
  return new VoiceAudioStorage(svc);
}
