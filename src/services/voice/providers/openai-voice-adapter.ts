/**
 * OpenAI Voice adapter — TTS (tts-1, tts-1-hd) + Whisper STT.
 */

import { env } from "@/config/env";
import { logger } from "@/services/logger";
import type {
  VoiceProviderAdapter,
  VoiceModelInfo,
  VoiceOption,
  TTSRequest,
  TTSResponse,
  STTRequest,
  STTResponse,
  STSRequest,
  CloneVoiceRequest,
  TranslateAudioRequest,
  VoiceCloneResponse,
  VoiceGenerationError,
} from "../types";

// ─── Voices ────────────────────────────────────────────────

const OPENAI_VOICES: VoiceOption[] = [
  { id: "alloy", name: "Alloy", gender: "neutral", language: "multi" },
  { id: "echo", name: "Echo", gender: "male", language: "multi" },
  { id: "fable", name: "Fable", gender: "neutral", language: "multi" },
  { id: "onyx", name: "Onyx", gender: "male", language: "multi" },
  { id: "nova", name: "Nova", gender: "female", language: "multi" },
  { id: "shimmer", name: "Shimmer", gender: "female", language: "multi" },
];

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

// ─── Models ────────────────────────────────────────────────

const MODELS: VoiceModelInfo[] = [
  {
    id: "openai-tts-1",
    name: "OpenAI TTS-1",
    provider: "openai-voice",
    description: "OpenAI text-to-speech optimized for speed",
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
    description: "OpenAI high-quality text-to-speech",
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
  {
    id: "openai-whisper",
    name: "OpenAI Whisper",
    provider: "openai-voice",
    description: "OpenAI Whisper speech-to-text, 50+ languages",
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
];

// ─── Helpers ────────────────────────────────────────────────

function makeError(message: string, code: string, statusCode?: number): VoiceGenerationError {
  return {
    message,
    code,
    provider: "openai-voice",
    statusCode,
    retryable: statusCode !== undefined && statusCode >= 500 && statusCode < 600,
  };
}

/** Map request format to OpenAI response_format. */
function mapFormat(format?: string): string {
  const map: Record<string, string> = {
    mp3: "mp3",
    wav: "wav",
    opus: "opus",
    aac: "aac",
    flac: "flac",
    pcm: "pcm",
  };
  return map[format ?? "mp3"] ?? "mp3";
}

/** Map model alias to OpenAI model name. */
function mapModelName(modelId?: string): string {
  if (modelId === "openai-tts-1-hd") return "tts-1-hd";
  return "tts-1";
}

// ─── Adapter ───────────────────────────────────────────────

export const openaiVoiceAdapter: VoiceProviderAdapter = {
  providerId: "openai-voice",
  displayName: "OpenAI Voice",

  getAvailableModels() {
    return MODELS;
  },

  async synthesizeSpeech(request: TTSRequest): Promise<TTSResponse> {
    const startTime = Date.now();
    try {
      const model = mapModelName(request.modelId);
      const voice = request.voiceId ?? "alloy";
      const format = mapFormat(request.outputFormat);

      const resp = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: request.text,
          voice,
          speed: request.speed ?? 1.0,
          response_format: format,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("OpenAI TTS error", { status: resp.status, body });
        throw makeError(`OpenAI TTS failed: ${resp.status}`, "TTS_ERROR", resp.status);
      }

      const audioBuffer = Buffer.from(await resp.arrayBuffer());
      const audioBase64 = audioBuffer.toString("base64");

      logger.info("OpenAI TTS completed", { model, voice, format, latencyMs: Date.now() - startTime });
      return { audioBase64, format };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown OpenAI TTS error";
      logger.error("OpenAI TTS exception", { error: err });
      throw makeError(message, "TTS_EXCEPTION");
    }
  },

  async transcribeSpeech(request: STTRequest): Promise<STTResponse> {
    const startTime = Date.now();
    try {
      const audioBuffer = Buffer.from(request.audioBase64, "base64");
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("file", blob, "audio.wav");
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json");

      if (request.language) {
        formData.append("language", request.language);
      }

      const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("OpenAI STT error", { status: resp.status, body });
        throw makeError(`OpenAI STT failed: ${resp.status}`, "STT_ERROR", resp.status);
      }

      const data = await resp.json();
      logger.info("OpenAI STT completed", { latencyMs: Date.now() - startTime });

      const timestamps = data.segments?.map(
        (s: { word?: string; start: number; end: number; text: string }) => ({
          word: s.word ?? s.text,
          start: s.start,
          end: s.end,
        })
      );

      return {
        transcript: data.text ?? "",
        confidence: data.confidence ?? 0.9,
        language: data.language ?? request.language ?? "en",
        timestamps: timestamps?.length > 0 ? timestamps : undefined,
      };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown OpenAI STT error";
      logger.error("OpenAI STT exception", { error: err });
      throw makeError(message, "STT_EXCEPTION");
    }
  },

  async speechToSpeech(_request: STSRequest): Promise<TTSResponse> {
    throw makeError("OpenAI does not support speech-to-speech", "STS_NOT_SUPPORTED", 400);
  },

  async cloneVoice(_request: CloneVoiceRequest): Promise<VoiceCloneResponse> {
    throw makeError("OpenAI does not support voice cloning", "CLONE_NOT_SUPPORTED", 400);
  },

  async translateAudio(_request: TranslateAudioRequest): Promise<TTSResponse> {
    throw makeError("OpenAI does not support audio translation", "TRANSLATE_NOT_SUPPORTED", 400);
  },
};
