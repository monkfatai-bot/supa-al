/**
 * Central voice model registry.
 * Each model is tagged with its provider so the
 * correct adapter can be resolved at request time.
 */

import type { VoiceModelInfo, VoiceOption } from "./types";

// ─── Voice option sets ────────────────────────────────────

const OPENAI_VOICES: VoiceOption[] = [
  { id: "alloy", name: "Alloy", gender: "neutral", language: "multi" },
  { id: "echo", name: "Echo", gender: "male", language: "multi" },
  { id: "fable", name: "Fable", gender: "neutral", language: "multi" },
  { id: "onyx", name: "Onyx", gender: "male", language: "multi" },
  { id: "nova", name: "Nova", gender: "female", language: "multi" },
  { id: "shimmer", name: "Shimmer", gender: "female", language: "multi" },
];

const ELEVENLABS_VOICES: VoiceOption[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", language: "en" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", gender: "female", language: "en" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", gender: "female", language: "en" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "male", language: "en" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", gender: "female", language: "en" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male", language: "en" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", gender: "male", language: "en" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", language: "en" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", gender: "male", language: "en" },
  { id: "jBpfuIE2acCO8z3wKNLl", name: "Gigi", gender: "female", language: "en" },
];

const CARTESIA_VOICES: VoiceOption[] = [
  { id: "7948e4da-29b2-4f1e-b64f-88a9e49a3e51", name: "Default", gender: "neutral", language: "en" },
];

// ─── Language sets ─────────────────────────────────────────

const OPENAI_TTS_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "el", "he",
  "id", "ms", "th", "vi", "uk", "cs", "ro", "hu", "sk", "bg",
];

const WHISPER_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "el", "he",
  "id", "ms", "th", "vi", "uk", "cs", "ro", "hu", "sk", "bg",
  "bn", "ca", "hr", "fil", "ka", "la", "lt", "lv", "mr", "sr",
  "sl", "su", "sw", "ta", "te", "ur", "uz",
];

const ELEVENLABS_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "pl", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "tr", "id", "uk", "fi", "sv", "da", "no", "cs", "el",
  "he", "ro", "hu", "sk", "vi", "th", "ms",
];

const GOOGLE_TTS_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "el", "he",
  "id", "ms", "th", "vi", "uk", "cs", "ro", "hu", "sk", "bg",
  "bn", "ca", "hr", "ka", "lt", "lv", "mr", "sr", "sl", "su", "sw",
  "ta", "te", "ur", "uz", "af", "am", "az", "eu", "be", "gu",
  "hy", "is", "kn", "ml", "mn", "my", "ne", "pa", "si", "et",
];

const AZURE_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "el", "he",
  "id", "ms", "th", "vi", "uk", "cs", "ro", "hu", "sk", "bg",
  "bn", "ca", "hr", "et", "fil", "gu", "is", "kn", "lt", "lv",
  "ml", "mr", "ne", "pa", "si", "sw", "ta", "te", "ur",
  "af", "am", "az", "eu", "be", "hy", "ka", "mk", "mn", "my",
  "or", "sr", "su", "uz",
];

const DEEPGRAM_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "uk", "cs", "ro",
  "hu", "vi", "th", "ms", "id", "bg",
];

const ASSEMBLYAI_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ja", "zh",
  "ar", "hi", "ko", "tr", "pl", "uk", "ru", "vi", "th",
];

const CARTESIA_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "el", "he",
  "id", "ms", "th", "vi", "uk", "cs", "ro", "hu", "sk", "bg",
];

const PLAYHT_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "pl", "ru", "ja", "ko", "zh",
  "ar", "hi", "tr", "id", "uk", "fi", "sv", "da", "no", "cs", "vi", "th",
];

const ALL_FORMATS = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "webm"];
const COMMON_SAMPLE_RATES = [8000, 16000, 22050, 24000, 44100, 48000];

// ─── Model registry ────────────────────────────────────────

export const AVAILABLE_VOICE_MODELS: VoiceModelInfo[] = [
  // ── OpenAI TTS ──
  {
    id: "openai-tts-1",
    name: "OpenAI TTS-1",
    provider: "openai-voice",
    description: "OpenAI's text-to-speech model optimized for speed, natural-sounding voices",
    supportedLanguages: OPENAI_TTS_LANGS,
    voiceType: "neural",
    gender: null,
    characterLimit: 4096,
    creditCost: 5,
    latencyMs: 300,
    supportsTts: true,
    supportsStt: false,
    supportsSts: false,
    supportsCloning: false,
    supportsTranslation: false,
    supportsDubbing: false,
    supportsEmotion: false,
    supportsDiarization: false,
    supportedFormats: ["mp3", "opus", "aac", "flac", "wav", "pcm"],
    supportedSampleRates: [24000],
    enabled: true,
    voices: OPENAI_VOICES,
  },
  {
    id: "openai-tts-1-hd",
    name: "OpenAI TTS-1-HD",
    provider: "openai-voice",
    description: "OpenAI's high-quality text-to-speech model with improved naturalness",
    supportedLanguages: OPENAI_TTS_LANGS,
    voiceType: "neural",
    gender: null,
    characterLimit: 4096,
    creditCost: 8,
    latencyMs: 600,
    supportsTts: true,
    supportsStt: false,
    supportsSts: false,
    supportsCloning: false,
    supportsTranslation: false,
    supportsDubbing: false,
    supportsEmotion: false,
    supportsDiarization: false,
    supportedFormats: ["mp3", "opus", "aac", "flac", "wav", "pcm"],
    supportedSampleRates: [24000],
    enabled: true,
    voices: OPENAI_VOICES,
  },

  // ── OpenAI Whisper (STT) ──
  {
    id: "openai-whisper",
    name: "OpenAI Whisper",
    provider: "openai-voice",
    description: "OpenAI's Whisper speech-to-text model, supports 50+ languages",
    supportedLanguages: WHISPER_LANGS,
    voiceType: "stt",
    gender: null,
    characterLimit: 0,
    creditCost: 8,
    latencyMs: 2000,
    supportsTts: false,
    supportsStt: true,
    supportsSts: false,
    supportsCloning: false,
    supportsTranslation: false,
    supportsDubbing: false,
    supportsEmotion: false,
    supportsDiarization: false,
    supportedFormats: ["mp3", "wav", "m4a", "webm", "flac", "ogg"],
    supportedSampleRates: [16000, 24000, 44100, 48000],
    enabled: true,
  },

  // ── ElevenLabs ──
  {
    id: "elevenlabs-turbo-v2",
    name: "ElevenLabs Turbo v2",
    provider: "elevenlabs",
    description: "ElevenLabs' fastest TTS model with voice cloning, emotion control, and 30+ languages",
    supportedLanguages: ELEVENLABS_LANGS,
    voiceType: "neural",
    gender: null,
    characterLimit: 5000,
    creditCost: 8,
    latencyMs: 200,
    supportsTts: true,
    supportsStt: true,
    supportsSts: true,
    supportsCloning: true,
    supportsTranslation: false,
    supportsDubbing: false,
    supportsEmotion: true,
    supportsDiarization: false,
    supportedFormats: ["mp3", "wav", "ogg", "flac", "m4a"],
    supportedSampleRates: COMMON_SAMPLE_RATES,
    enabled: true,
    voices: ELEVENLABS_VOICES,
  },

  // ── Google Cloud TTS ──
  {
    id: "google-cloud-tts",
    name: "Google Cloud TTS",
    provider: "google-voice",
    description: "Google Cloud text-to-speech with WaveNet and 40+ languages, SSML support",
    supportedLanguages: GOOGLE_TTS_LANGS,
    voiceType: "neural",
    gender: null,
    characterLimit: 5000,
    creditCost: 5,
    latencyMs: 400,
    supportsTts: true,
    supportsStt: true,
    supportsSts: false,
    supportsCloning: false,
    supportsTranslation: true,
    supportsDubbing: false,
    supportsEmotion: false,
    supportsDiarization: true,
    supportedFormats: ["mp3", "wav", "ogg"],
    supportedSampleRates: [8000, 16000, 22050, 24000, 44100, 48000],
    enabled: true,
  },

  // ── Azure Speech ──
  {
    id: "azure-neural-tts",
    name: "Azure Neural TTS",
    provider: "azure-voice",
    description: "Microsoft Azure AI Speech with neural voices, 100+ languages, and real-time STT",
    supportedLanguages: AZURE_LANGS,
    voiceType: "neural",
    gender: null,
    characterLimit: 5000,
    creditCost: 6,
    latencyMs: 300,
    supportsTts: true,
    supportsStt: true,
    supportsSts: false,
    supportsCloning: false,
    supportsTranslation: true,
    supportsDubbing: false,
    supportsEmotion: false,
    supportsDiarization: true,
    supportedFormats: ["mp3", "wav", "ogg"],
    supportedSampleRates: [8000, 16000, 22050, 24000, 44100, 48000],
    enabled: true,
  },

  // ── Deepgram ──
  {
    id: "deepgram-nova-2",
    name: "Deepgram Nova-2",
    provider: "deepgram",
    description: "Deepgram's state-of-the-art STT model with speaker diarization and fast latency",
    supportedLanguages: DEEPGRAM_LANGS,
    voiceType: "stt",
    gender: null,
    characterLimit: 0,
    creditCost: 8,
    latencyMs: 500,
    supportsTts: false,
    supportsStt: true,
    supportsSts: false,
    supportsCloning: false,
    supportsTranslation: false,
    supportsDubbing: false,
    supportsEmotion: false,
    supportsDiarization: true,
    supportedFormats: ALL_FORMATS,
    supportedSampleRates: [8000, 16000, 22050, 24000, 44100, 48000],
    enabled: true,
  },

  // ── AssemblyAI ──
  {
    id: "assemblyai-best",
    name: "AssemblyAI Universal",
    provider: "assemblyai",
    description: "AssemblyAI's universal STT model with diarization, chapters, and word-level timestamps",
    supportedLanguages: ASSEMBLYAI_LANGS,
    voiceType: "stt",
    gender: null,
    characterLimit: 0,
    creditCost: 10,
    latencyMs: 1500,
    supportsTts: false,
    supportsStt: true,
    supportsSts: false,
    supportsCloning: false,
    supportsTranslation: false,
    supportsDubbing: false,
    supportsEmotion: false,
    supportsDiarization: true,
    supportedFormats: ALL_FORMATS,
    supportedSampleRates: [16000, 22050, 24000, 44100, 48000],
    enabled: true,
  },

  // ── Cartesia ──
  {
    id: "cartesia-sonic",
    name: "Cartesia Sonic",
    provider: "cartesia",
    description: "Cartesia's Sonic model for expressive TTS with emotion control and voice cloning",
    supportedLanguages: CARTESIA_LANGS,
    voiceType: "neural",
    gender: null,
    characterLimit: 5000,
    creditCost: 10,
    latencyMs: 150,
    supportsTts: true,
    supportsStt: false,
    supportsSts: false,
    supportsCloning: true,
    supportsTranslation: false,
    supportsDubbing: false,
    supportsEmotion: true,
    supportsDiarization: false,
    supportedFormats: ["mp3", "wav", "ogg", "flac"],
    supportedSampleRates: [24000, 44100, 48000],
    enabled: true,
    voices: CARTESIA_VOICES,
  },

  // ── PlayHT ──
  {
    id: "playht-2.0",
    name: "PlayHT 2.0",
    provider: "playht",
    description: "PlayHT's latest TTS model with voice cloning and speech-to-speech capabilities",
    supportedLanguages: PLAYHT_LANGS,
    voiceType: "neural",
    gender: null,
    characterLimit: 5000,
    creditCost: 7,
    latencyMs: 400,
    supportsTts: true,
    supportsStt: false,
    supportsSts: true,
    supportsCloning: true,
    supportsTranslation: false,
    supportsDubbing: false,
    supportsEmotion: false,
    supportsDiarization: false,
    supportedFormats: ["mp3", "wav", "ogg", "flac"],
    supportedSampleRates: COMMON_SAMPLE_RATES,
    enabled: true,
  },
];

// ─── Query helpers ─────────────────────────────────────────

/** Find a model by its ID. Returns undefined if not found. */
export function getVoiceModelById(modelId: string): VoiceModelInfo | undefined {
  return AVAILABLE_VOICE_MODELS.find((m) => m.id === modelId);
}

/** Get the default TTS model. */
export function getDefaultTTSModel(): VoiceModelInfo {
  const enabled = AVAILABLE_VOICE_MODELS.filter((m) => m.enabled && m.supportsTts);
  return enabled[0] ?? AVAILABLE_VOICE_MODELS[0];
}

/** Get the default STT model. */
export function getDefaultSTTModel(): VoiceModelInfo {
  const enabled = AVAILABLE_VOICE_MODELS.filter((m) => m.enabled && m.supportsStt);
  return enabled[0] ?? AVAILABLE_VOICE_MODELS.find((m) => m.supportsStt) ?? AVAILABLE_VOICE_MODELS[0];
}

/** Get all enabled models. */
export function getEnabledVoiceModels(): VoiceModelInfo[] {
  return AVAILABLE_VOICE_MODELS.filter((m) => m.enabled);
}

/** Get models grouped by provider. */
export function getVoiceModelsByProvider(): Record<string, VoiceModelInfo[]> {
  const grouped: Record<string, VoiceModelInfo[]> = {};
  for (const model of AVAILABLE_VOICE_MODELS) {
    if (!grouped[model.provider]) grouped[model.provider] = [];
    grouped[model.provider].push(model);
  }
  return grouped;
}

/** Get all unique provider IDs from voice models. */
export function getVoiceProviders(): string[] {
  return [...new Set(AVAILABLE_VOICE_MODELS.map((m) => m.provider))];
}

/** Resolve a provider ID from a model ID. Throws if not found. */
export function resolveVoiceProvider(modelId: string): string {
  const model = getVoiceModelById(modelId);
  if (!model) throw new Error(`Unknown voice model: ${modelId}`);
  return model.provider;
}
