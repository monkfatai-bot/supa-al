/**
 * Supa AI — Voice Zod schemas (Phase 8).
 *
 * Reusable validation rules for every Phase 8 voice surface: TTS, STT,
 * translate, dub, clone, upload, history, transcripts, profiles, models,
 * jobs, and usage. Infer types from these schemas so the runtime contract
 * and the TypeScript type can never drift apart.
 *
 * @module @/lib/validation/voice
 */
import { z } from "zod";

import { uuidSchema } from "./common";

// ---------------------------------------------------------------------------
// Providers + enums
// ---------------------------------------------------------------------------

/**
 * Voice provider identifiers supported by the platform. Mirrors
 * `VoiceProviderId` in `@/lib/ai/voice-types` so the schema is the
 * single source of truth for runtime validation.
 */
export const voiceProviderSchema = z.enum([
  "openai",
  "elevenlabs",
  "google",
  "azure",
  "deepgram",
  "assemblyai",
  "cartesia",
  "playht",
]);

export const voiceTypeSchema = z.enum([
  "tts",
  "stt",
  "translate",
  "dub",
  "clone",
]);

export const voiceModelTypeSchema = z.enum(["tts", "stt"]);

export const voiceStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const voiceAudioFormatSchema = z.enum([
  "mp3",
  "wav",
  "ogg",
  "flac",
  "pcm",
  "opus",
  "aac",
  "m4a",
]);

// ---------------------------------------------------------------------------
// Synthesize (TTS)
// ---------------------------------------------------------------------------

const ttsTextSchema = z
  .string()
  .trim()
  .min(1, "Text must not be empty.")
  .max(12_000, "Text must be at most 12000 characters (provider limit).");

const voiceIdSchema = z
  .string()
  .trim()
  .min(1, "Voice id must not be empty.")
  .max(256, "Voice id must be at most 256 characters.");

const languageSchema = z
  .string()
  .trim()
  .min(2, "Language must be at least 2 characters (BCP-47 tag).")
  .max(16, "Language must be at most 16 characters.")
  .optional();

const voiceSettingsSchema = z
  .object({
    speed: z.number().min(0.25).max(4).optional(),
    pitch: z.number().min(-12).max(12).optional(),
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    speakerBoost: z.boolean().optional(),
    sampleRate: z.number().int().min(8_000).max(48_000).optional(),
    format: voiceAudioFormatSchema.optional(),
    stream: z.boolean().optional(),
  })
  .passthrough();

export const synthesizeSchema = z
  .object({
    text: ttsTextSchema,
    provider: voiceProviderSchema,
    model: z.string().trim().min(1).max(128).optional(),
    voiceId: voiceIdSchema,
    language: languageSchema,
    format: voiceAudioFormatSchema.optional(),
    settings: voiceSettingsSchema.optional(),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Transcribe (STT)
// ---------------------------------------------------------------------------

export const transcribeSchema = z
  .object({
    audioUploadId: uuidSchema,
    provider: voiceProviderSchema,
    model: z.string().trim().min(1).max(128).optional(),
    language: languageSchema,
    speakerLabels: z.boolean().optional(),
    wordTimestamps: z.boolean().optional(),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Translate
// ---------------------------------------------------------------------------

export const translateSchema = z
  .object({
    audioUploadId: uuidSchema,
    provider: voiceProviderSchema,
    model: z.string().trim().min(1).max(128).optional(),
    sourceLanguage: languageSchema,
    targetLanguage: z
      .string()
      .trim()
      .min(2, "Target language is required.")
      .max(16, "Target language must be at most 16 characters."),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Dub
// ---------------------------------------------------------------------------

export const dubSchema = z
  .object({
    audioUploadId: uuidSchema,
    provider: voiceProviderSchema,
    model: z.string().trim().min(1).max(128).optional(),
    sourceLanguage: languageSchema,
    targetLanguage: z
      .string()
      .trim()
      .min(2, "Target language is required.")
      .max(16, "Target language must be at most 16 characters."),
    voiceId: z.string().trim().max(256).optional(),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

export const cloneSchema = z
  .object({
    audioUploadId: uuidSchema,
    provider: voiceProviderSchema,
    name: z
      .string()
      .trim()
      .min(1, "Voice name is required.")
      .max(80, "Voice name must be at most 80 characters."),
    description: z
      .string()
      .trim()
      .max(500, "Description must be at most 500 characters.")
      .optional(),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const createProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Profile name is required.")
      .max(80, "Profile name must be at most 80 characters."),
    provider: voiceProviderSchema,
    voiceId: voiceIdSchema,
    language: languageSchema,
    settings: voiceSettingsSchema.optional(),
    isCloned: z.boolean().optional(),
    sampleAudioUrl: z.string().trim().max(1024).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

export const listProfilesQuerySchema = z.object({
  provider: voiceProviderSchema.optional(),
  isCloned: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

// ---------------------------------------------------------------------------
// History + transcripts + jobs + usage + models + uploads
// ---------------------------------------------------------------------------

export const listHistoryQuerySchema = z.object({
  type: voiceTypeSchema.optional(),
  provider: voiceProviderSchema.optional(),
  status: voiceStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

export const listTranscriptsQuerySchema = z.object({
  generationId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

export const listJobsQuerySchema = z.object({
  status: voiceStatusSchema.optional(),
  generationId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

export const listModelsQuerySchema = z.object({
  provider: voiceProviderSchema.optional(),
  type: voiceModelTypeSchema.optional(),
});

export const jobActionSchema = z
  .object({
    action: z.enum(["retry", "cancel"]),
  })
  .strict();

export const usageQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------
// Upload (query parameters only — body is multipart)
// ---------------------------------------------------------------------------

export const listUploadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type VoiceProvider = z.infer<typeof voiceProviderSchema>;
export type VoiceType = z.infer<typeof voiceTypeSchema>;
export type VoiceModelType = z.infer<typeof voiceModelTypeSchema>;
export type VoiceStatus = z.infer<typeof voiceStatusSchema>;
export type VoiceAudioFormat = z.infer<typeof voiceAudioFormatSchema>;
export type SynthesizeInput = z.infer<typeof synthesizeSchema>;
export type TranscribeInput = z.infer<typeof transcribeSchema>;
export type TranslateInput = z.infer<typeof translateSchema>;
export type DubInput = z.infer<typeof dubSchema>;
export type CloneInput = z.infer<typeof cloneSchema>;
export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type ListProfilesQuery = z.infer<typeof listProfilesQuerySchema>;
export type ListHistoryQuery = z.infer<typeof listHistoryQuerySchema>;
export type ListTranscriptsQuery = z.infer<typeof listTranscriptsQuerySchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
export type ListModelsQuery = z.infer<typeof listModelsQuerySchema>;
export type ListUploadsQuery = z.infer<typeof listUploadsQuerySchema>;
export type JobActionInput = z.infer<typeof jobActionSchema>;
export type UsageQuery = z.infer<typeof usageQuerySchema>;
