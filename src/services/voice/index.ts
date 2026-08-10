/**
 * Voice service barrel export.
 * Only exports actions, types, and model info.
 * Provider adapters and registry are NOT re-exported.
 */

export {
  generateSpeech,
  transcribeAudio,
  cloneVoice,
  translateAudio,
  getVoiceHistory,
  getVoiceDetails,
  cancelJob,
  deleteVoice,
  toggleFavoriteVoice,
  duplicateVoice,
  getSignedAudioUrl,
  getSignedAudioUrlsForPaths,
  getVoiceProfiles,
  deleteVoiceProfile,
  getVoiceStats,
  getActiveJobs,
} from "./actions";

export function sanitizeInput(text: string, maxLength?: number): string {
  const max = maxLength ?? 5000;
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
}

export type {
  VoiceActionResponse,
  TTSServerResponse,
  STTServerResponse,
  VoiceHistoryItem,
  VoiceHistoryParams,
  VoiceHistoryResult,
} from "./actions";

export type {
  VoiceOperationType,
  VoiceGenerationStatus,
  VoiceJobStatus,
  AudioFormat,
  TTSRequest,
  STTRequest,
  STSRequest,
  CloneVoiceRequest,
  TranslateAudioRequest,
  VoiceModelInfo,
  VoiceOption,
  VoiceProviderAdapter,
  TTSResponse,
  STTResponse,
  VoiceCloneResponse,
  VoiceGenerationError,
} from "./types";

export {
  DEFAULT_TTS_SETTINGS,
} from "./types";

export {
  AVAILABLE_VOICE_MODELS,
  getVoiceModelById,
  getDefaultTTSModel,
  getDefaultSTTModel,
  getEnabledVoiceModels,
  getVoiceModelsByProvider,
  getVoiceProviders,
  resolveVoiceProvider,
} from "./models";

// Re-export DB types for convenience
export type {
  VoiceGeneration,
  VoiceJob,
  VoiceProfile,
  VoiceTranscript,
  VoiceUsage,
  AudioUpload,
} from "@/types/generated/database";
