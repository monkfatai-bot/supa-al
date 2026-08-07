/**
 * Supa AI — Voice provider abstraction types (Phase 8).
 *
 * Provider-agnostic shapes for text-to-speech (TTS), speech-to-text (STT),
 * translation, dubbing, and voice cloning. Every concrete voice provider
 * implementation maps its native SDK to these types so call sites never
 * branch on provider.
 *
 * This module is server-only — concrete provider implementations live under
 * `src/lib/ai/voice-providers/`.
 *
 * @module @/lib/ai/voice-types
 */

/**
 * Voice provider identifiers supported by the platform.
 *
 * The order here mirrors the registry/manager order. Keep in sync with
 * {@link VOICE_PROVIDER_LABELS} below.
 */
export type VoiceProviderId =
  | "openai"
  | "elevenlabs"
  | "google"
  | "azure"
  | "deepgram"
  | "assemblyai"
  | "cartesia"
  | "playht";

/** Human-readable label for a {@link VoiceProviderId}. */
export const VOICE_PROVIDER_LABELS: Readonly<Record<VoiceProviderId, string>> =
  Object.freeze({
    openai: "OpenAI",
    elevenlabs: "ElevenLabs",
    google: "Google",
    azure: "Azure",
    deepgram: "Deepgram",
    assemblyai: "AssemblyAI",
    cartesia: "Cartesia",
    playht: "PlayHT",
  });

/** The operation type this voice platform supports. */
export type VoiceOperationType =
  | "tts"
  | "stt"
  | "translate"
  | "dub"
  | "clone";

/** Output audio format requested from a TTS call. */
export type VoiceAudioFormat =
  | "mp3"
  | "wav"
  | "ogg"
  | "flac"
  | "pcm"
  | "opus"
  | "aac"
  | "m4a";

/** Per-call voice settings passed alongside the request. */
export interface VoiceSettings {
  /** 0..2 speaking rate multiplier (1.0 = natural). */
  speed?: number;
  /** -12..+12 pitch shift (semitones for some providers, percent for others). */
  pitch?: number;
  /** 0..1 stability (ElevenLabs-specific). */
  stability?: number;
  /** 0..1 similarity boost (ElevenLabs-specific). */
  similarityBoost?: number;
  /** 0..1 style exaggeration (ElevenLabs-specific). */
  style?: number;
  /** 0..1 speaker boost (ElevenLabs-specific). */
  speakerBoost?: boolean;
  /** Output sample rate in Hz (provider-dependent). */
  sampleRate?: number;
  /** Output container/format. */
  format?: VoiceAudioFormat;
  /** Whether to stream chunks as they're generated (provider-dependent). */
  stream?: boolean;
  /** Free-form extra settings provider-specific code understands. */
  extra?: Record<string, unknown>;
}

/** A single voice catalog entry reported by a provider. */
export interface VoiceCatalogEntry {
  /** Stable provider-specific voice id. */
  id: string;
  /** Human-readable name. */
  label: string;
  /** BCP-47 language tag (e.g. "en-US"). */
  language?: string;
  /** Reported gender, when known. */
  gender?: "male" | "female" | "neutral";
  /** Whether the voice supports instant cloning. */
  cloneable?: boolean;
  /** Free-form extras (preview_url, accent, tags, etc.). */
  metadata?: Record<string, unknown>;
}

/** A model offered by a voice provider. */
export interface VoiceModelInfo {
  /** Provider's stable model id (e.g. "tts-1", "eleven-multilingual-v2"). */
  id: string;
  /** Display label. */
  label: string;
  /** Provider id. */
  provider: VoiceProviderId;
  /** Whether this is a TTS or STT model. */
  type: "tts" | "stt";
  /** Short marketing copy. */
  description?: string;
  /** Supported BCP-47 language tags. */
  supportedLanguages: string[];
  /** Supported voices (TTS only). */
  supportedVoices: VoiceCatalogEntry[];
  /** Whether the model supports streaming output. */
  streaming?: boolean;
  /** Whether the model supports voice cloning. */
  cloneable?: boolean;
  /** Cost in USD cents per 1K characters (TTS) or per audio-minute (STT). */
  costCentsPer1K?: number;
  /** Free-form extras. */
  metadata?: Record<string, unknown>;
}

/** Request to a TTS (synthesize) endpoint. */
export interface SynthesizeRequest {
  /** The text to convert to speech. */
  text: string;
  /** Provider's model id (defaults to the provider's recommended model). */
  model?: string;
  /** Provider's voice id (e.g. "alloy", "21m00Tcm4TlvDq8ikWAM"). */
  voiceId: string;
  /** Output format. */
  format?: VoiceAudioFormat;
  /** BCP-47 language tag. */
  language?: string;
  /** Per-call settings. */
  settings?: VoiceSettings;
}

/** Result of a TTS (synthesize) call. */
export interface SynthesizeResult {
  /** Audio bytes (binary). */
  audio: ArrayBuffer;
  /** MIME type of the returned audio. */
  mimeType: string;
  /** Format that was returned (may differ from request when the provider
   * does not support the requested format). */
  format: VoiceAudioFormat;
  /** Output duration in milliseconds (when reported). */
  durationMs?: number;
  /** Sample rate in Hz (when reported). */
  sampleRate?: number;
  /** Provider's raw response payload (for support tickets). */
  raw?: unknown;
}

/** Request to an STT (transcribe) endpoint. */
export interface TranscribeRequest {
  /** Audio bytes to transcribe. */
  audio: ArrayBuffer;
  /** MIME type of the input audio (e.g. "audio/mpeg"). */
  mimeType: string;
  /** Provider's model id (defaults to the provider's recommended model). */
  model?: string;
  /** BCP-47 language tag (hint). */
  language?: string;
  /** Whether to enable speaker diarization. */
  speakerLabels?: boolean;
  /** Whether to enable word-level timestamps. */
  wordTimestamps?: boolean;
  /** Per-call extras. */
  extra?: Record<string, unknown>;
}

/** A single timestamped segment of a transcript. */
export interface TranscriptSegment {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  /** Transcript text for this segment. */
  text: string;
  /** Speaker label when diarization is enabled (e.g. "A", "B"). */
  speaker?: string;
  /** Confidence in the segment (0..1). */
  confidence?: number;
  /** Per-word timestamps when requested. */
  words?: Array<{ word: string; start: number; end: number; confidence?: number }>;
}

/** Result of an STT (transcribe) call. */
export interface TranscribeResult {
  /** Full transcript text. */
  text: string;
  /** Detected language (BCP-47). */
  language?: string;
  /** Overall confidence (0..1). */
  confidence?: number;
  /** Timestamped segments. */
  segments?: TranscriptSegment[];
  /** Provider's raw response payload. */
  raw?: unknown;
}

/** Request to translate audio from one language to another. */
export interface TranslateRequest {
  /** Source audio bytes. */
  audio: ArrayBuffer;
  /** MIME type of the source audio. */
  mimeType: string;
  /** Source BCP-47 language tag (or omit for auto-detect). */
  sourceLanguage?: string;
  /** Target BCP-47 language tag. */
  targetLanguage: string;
  /** Provider's model id. */
  model?: string;
}

/** Result of a translation call. */
export interface TranslateResult {
  /** Translated transcript text. */
  text: string;
  /** Detected source language (BCP-47). */
  detectedSourceLanguage?: string;
  /** Target language (BCP-47, echoed). */
  targetLanguage: string;
  /** Confidence (0..1). */
  confidence?: number;
  /** Provider's raw response payload. */
  raw?: unknown;
}

/** Request to dub an audio clip into another language. */
export interface DubRequest {
  /** Source audio bytes. */
  audio: ArrayBuffer;
  /** MIME type of the source audio. */
  mimeType: string;
  /** Source BCP-47 language tag (or omit for auto-detect). */
  sourceLanguage?: string;
  /** Target BCP-47 language tag. */
  targetLanguage: string;
  /** Voice id to use for the dubbed output (optional — provider may pick). */
  voiceId?: string;
  /** Provider's model id. */
  model?: string;
}

/** Result of a dubbing call. */
export interface DubResult {
  /** URL to the dubbed audio (provider-hosted). */
  url: string;
  /** Output duration in milliseconds (when reported). */
  durationMs?: number;
  /** External job id (for status polling on async providers). */
  externalJobId?: string;
  /** Provider's raw response payload. */
  raw?: unknown;
}

/** Request to clone a voice from a sample audio clip. */
export interface CloneRequest {
  /** Sample audio bytes (the voice to clone). */
  audio: ArrayBuffer;
  /** MIME type of the sample audio. */
  mimeType: string;
  /** Display name for the cloned voice. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Free-form extras (e.g. consent text the provider may require). */
  extra?: Record<string, unknown>;
}

/** Result of a voice-cloning call. */
export interface CloneResult {
  /** Provider's id for the newly-cloned voice. */
  voiceId: string;
  /** Whether the cloned voice requires additional training. */
  ready: boolean;
  /** External job id (for status polling on async providers). */
  externalJobId?: string;
  /** Provider's raw response payload. */
  raw?: unknown;
}

/** Capability flags reported by a voice provider. */
export interface VoiceProviderCapabilities {
  /** Supports text-to-speech. */
  tts: boolean;
  /** Supports speech-to-text. */
  stt: boolean;
  /** Supports audio translation. */
  translate: boolean;
  /** Supports dubbing (audio-to-audio translation). */
  dub: boolean;
  /** Supports voice cloning. */
  clone: boolean;
}
