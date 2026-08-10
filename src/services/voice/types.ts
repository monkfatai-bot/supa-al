/**
 * Voice service type system — provider-agnostic.
 * All adapters must conform to these interfaces.
 */

// ─── Re-export DB types ───────────────────────────────────

export type {
  VoiceOperationType,
  VoiceGenerationStatus,
  VoiceJobStatus,
  AudioFormat,
} from "@/types/generated/database";

// ─── Request Types ─────────────────────────────────────────

/** TTS (text-to-speech) request. */
export interface TTSRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  style?: string;
  outputFormat?: string;
  sampleRate?: number;
}

/** STT (speech-to-text) request. */
export interface STTRequest {
  audioBase64: string;
  audioStoragePath?: string;
  language?: string;
  modelId?: string;
  sampleRate?: number;
  enableDiarization?: boolean;
  enableTimestamps?: boolean;
  enableChapters?: boolean;
}

/** STS (speech-to-speech) request. */
export interface STSRequest {
  audioBase64: string;
  audioStoragePath?: string;
  targetVoiceId?: string;
  modelId?: string;
  language?: string;
}

/** Clone voice request. */
export interface CloneVoiceRequest {
  name: string;
  description?: string;
  audioBase64: string;
  audioStoragePath?: string;
  provider: string;
  language?: string;
  gender?: string;
}

/** Translate audio request. */
export interface TranslateAudioRequest {
  audioBase64: string;
  audioStoragePath?: string;
  inputLanguage: string;
  outputLanguage: string;
  modelId?: string;
}

// ─── Model / Provider Metadata ────────────────────────────

/** Single voice option within a model. */
export interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  language: string;
  previewUrl?: string;
}

/** Rich metadata for a voice model. */
export interface VoiceModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  supportedLanguages: string[];
  voiceType: string;
  gender: string | null;
  characterLimit: number;
  creditCost: number;
  latencyMs: number;
  supportsTts: boolean;
  supportsStt: boolean;
  supportsSts: boolean;
  supportsCloning: boolean;
  supportsTranslation: boolean;
  supportsDubbing: boolean;
  supportsEmotion: boolean;
  supportsDiarization: boolean;
  supportedFormats: string[];
  supportedSampleRates: number[];
  enabled: boolean;
  voices?: VoiceOption[];
}

// ─── Adapter Interface ──────────────────────────────────────

/** Interface every voice provider adapter must implement. */
export interface VoiceProviderAdapter {
  readonly providerId: string;
  readonly displayName: string;

  /** Return metadata for all models this provider offers. */
  getAvailableModels(): VoiceModelInfo[];

  /** Text-to-speech. Returns audio as base64-encoded string. */
  synthesizeSpeech(request: TTSRequest): Promise<TTSResponse>;

  /** Speech-to-text transcription. */
  transcribeSpeech(request: STTRequest): Promise<STTResponse>;

  /** Speech-to-speech voice conversion. */
  speechToSpeech(request: STSRequest): Promise<TTSResponse>;

  /** Clone a voice from an audio sample. */
  cloneVoice(request: CloneVoiceRequest): Promise<VoiceCloneResponse>;

  /** Translate audio from one language to another. */
  translateAudio(request: TranslateAudioRequest): Promise<TTSResponse>;

  /** Cancel a running job (optional). */
  cancelJob?(providerJobId: string, model: string): Promise<void>;
}

// ─── Response Types ────────────────────────────────────────

/** TTS output. */
export interface TTSResponse {
  audioBase64: string;
  durationSeconds?: number;
  format: string;
}

/** STT output. */
export interface STTResponse {
  transcript: string;
  confidence: number;
  language: string;
  timestamps?: Array<{ word: string; start: number; end: number }>;
  speakerLabels?: Array<{ speaker: string; start: number; end: number }>;
  chapters?: Array<{ start: number; end: number; headline: string; summary: string }>;
}

/** Voice clone output. */
export interface VoiceCloneResponse {
  voiceProfileId: string;
  providerVoiceId: string;
  previewUrl?: string;
}

/** Error returned when a voice operation fails. */
export interface VoiceGenerationError {
  message: string;
  code: string;
  provider: string;
  statusCode?: number;
  retryable: boolean;
}

// ─── Defaults ──────────────────────────────────────────────

/** Default TTS generation settings. */
export const DEFAULT_TTS_SETTINGS: Omit<TTSRequest, "text"> = {
  voiceId: "alloy",
  speed: 1.0,
  pitch: 1.0,
  volume: 1.0,
  outputFormat: "mp3",
  sampleRate: 24000,
};
