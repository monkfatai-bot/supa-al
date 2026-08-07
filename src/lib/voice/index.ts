/**
 * Supa AI — Phase 8 Voice — full barrel (server-only).
 *
 * Re-exports the client-safe types *plus* the server-only services and
 * helpers. Importing this barrel from a Client Component will throw at
 * build time — client code MUST import from `@/lib/voice/client` instead.
 *
 * @module @/lib/voice
 */
import "server-only";

export * from "./client";
export {
  VoiceService,
  createVoiceService,
  PaymentError,
  AIProviderError,
} from "./voice-service";
export {
  createVoiceAudioStorage,
  VoiceAudioStorage,
  VOICE_AUDIO_MIME_TYPES,
  VOICE_AUDIO_MAX_BYTES,
} from "./audio-storage";
export {
  AudioUploadService,
  createAudioUploadService,
  makeAudioUploadService,
} from "./audio-upload";
export {
  CatalogService,
  createCatalogService,
} from "./catalog";
export {
  TranscriptService,
  createTranscriptService,
} from "./transcript";
export {
  HistoryService,
  createHistoryService,
} from "./history";
export {
  ProfileService,
  createProfileService,
} from "./profile";
export {
  JobQueueService,
  createJobQueueService,
  scheduleBackgroundJob,
} from "./job-queue";
export {
  UsageService,
  createUsageService,
} from "./usage";
