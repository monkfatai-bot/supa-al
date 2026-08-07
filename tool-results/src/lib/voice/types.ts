/**
 * Supa AI — Phase 8 Voice — client-safe types.
 *
 * Domain-level types shared by the voice service layer, API routes, and
 * the client UI. These are intentionally plain TS types (no Zod, no
 * `server-only`) so the file is safe to import from client components
 * via the {@link "@/lib/voice/client"} barrel.
 *
 * The DB-level row shapes live in `@/lib/supabase/types` (`Tables<'...'>`).
 *
 * @module @/lib/voice/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Status enums (mirrors the CHECK constraints in 0008_phase6_voice.sql)
// ---------------------------------------------------------------------------

/** Lifecycle status of a `voice_generations` row. */
export type VoiceGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

/** Operation type that produced a `voice_generations` row. */
export type VoiceGenerationType =
  | "tts"
  | "stt"
  | "translate"
  | "dub"
  | "clone";

/** Lifecycle status of a `voice_jobs` row. */
export type VoiceJobStatus = VoiceGenerationStatus;

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

/** Full row of `voice_generations`. */
export type VoiceGeneration = Tables<"voice_generations">;
/** Full row of `voice_models`. */
export type VoiceModel = Tables<"voice_models">;
/** Full row of `voice_profiles`. */
export type VoiceProfile = Tables<"voice_profiles">;
/** Full row of `voice_transcripts`. */
export type VoiceTranscript = Tables<"voice_transcripts">;
/** Full row of `audio_uploads`. */
export type AudioUpload = Tables<"audio_uploads">;
/** Full row of `voice_jobs`. */
export type VoiceJob = Tables<"voice_jobs">;
/** Full row of `voice_usage`. */
export type VoiceUsage = Tables<"voice_usage">;

// ---------------------------------------------------------------------------
// Insert / Update shapes (used by the service)
// ---------------------------------------------------------------------------

export type VoiceGenerationInsert = TablesInsert<"voice_generations">;
export type VoiceGenerationUpdate = TablesUpdate<"voice_generations">;
export type VoiceModelInsert = TablesInsert<"voice_models">;
export type VoiceProfileInsert = TablesInsert<"voice_profiles">;
export type VoiceProfileUpdate = TablesUpdate<"voice_profiles">;
export type VoiceTranscriptInsert = TablesInsert<"voice_transcripts">;
export type AudioUploadInsert = TablesInsert<"audio_uploads">;
export type VoiceJobInsert = TablesInsert<"voice_jobs">;
export type VoiceJobUpdate = TablesUpdate<"voice_jobs">;
export type VoiceUsageInsert = TablesInsert<"voice_usage">;
export type VoiceUsageUpdate = TablesUpdate<"voice_usage">;

// ---------------------------------------------------------------------------
// Service-level DTOs (input shapes accepted by the service methods)
// ---------------------------------------------------------------------------

export interface SynthesizeInput {
  workspaceId: string;
  userId: string;
  text: string;
  provider: string;
  model?: string;
  voiceId: string;
  language?: string;
  format?: string;
  settings?: Record<string, unknown>;
}

export interface TranscribeInput {
  workspaceId: string;
  userId: string;
  audioUploadId: string;
  provider: string;
  model?: string;
  language?: string;
  speakerLabels?: boolean;
  wordTimestamps?: boolean;
}

export interface TranslateInput {
  workspaceId: string;
  userId: string;
  audioUploadId: string;
  provider: string;
  model?: string;
  sourceLanguage?: string;
  targetLanguage: string;
}

export interface DubInput {
  workspaceId: string;
  userId: string;
  audioUploadId: string;
  provider: string;
  model?: string;
  sourceLanguage?: string;
  targetLanguage: string;
  voiceId?: string;
}

export interface CloneInput {
  workspaceId: string;
  userId: string;
  audioUploadId: string;
  provider: string;
  name: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Composite relation shape returned by `VoiceService.getGeneration`
// ---------------------------------------------------------------------------

export interface VoiceGenerationWithRelations extends VoiceGeneration {
  transcript?: VoiceTranscript | null;
  job?: VoiceJob | null;
}

// ---------------------------------------------------------------------------
// Usage summary shape returned by `UsageService.getSummary`
// ---------------------------------------------------------------------------

export interface VoiceUsageSummary {
  totalGenerations: number;
  totalCreditsUsed: number;
  byType: {
    tts: number;
    stt: number;
    translate: number;
    dub: number;
    clone: number;
  };
  byProvider: Record<string, { generations: number; creditsUsed: number }>;
  period: { start: string; end: string };
}
