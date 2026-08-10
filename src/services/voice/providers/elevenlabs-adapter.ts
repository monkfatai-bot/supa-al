/**
 * ElevenLabs adapter — TTS, STT, STS, Voice Cloning.
 */

import { env } from "@/config/env";
import { logger } from "@/services/logger";
import type {
  VoiceProviderAdapter,
  VoiceModelInfo,
  TTSRequest,
  TTSResponse,
  STTRequest,
  STTResponse,
  STSRequest,
  CloneVoiceRequest,
  TranslateAudioRequest,
  VoiceCloneResponse,
  VoiceGenerationError,
  VoiceOption,
} from "../types";

// ─── Voices (static subset; full list fetched at runtime) ───

const STATIC_VOICES: VoiceOption[] = [
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

const ELEVENLABS_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "pl", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "tr", "id", "uk", "fi", "sv", "da", "no", "cs", "el",
  "he", "ro", "hu", "sk", "vi", "th", "ms",
];

// ─── Models ────────────────────────────────────────────────

const MODELS: VoiceModelInfo[] = [
  {
    id: "elevenlabs-turbo-v2",
    name: "ElevenLabs Turbo v2",
    provider: "elevenlabs",
    description: "ElevenLabs TTS with voice cloning, emotion control, and 30+ languages",
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
    supportedSampleRates: [8000, 16000, 22050, 24000, 44100, 48000],
    enabled: true,
    voices: STATIC_VOICES,
  },
];

// ─── Helpers ────────────────────────────────────────────────

function makeError(message: string, code: string, statusCode?: number): VoiceGenerationError {
  return {
    message,
    code,
    provider: "elevenlabs",
    statusCode,
    retryable: statusCode !== undefined && statusCode >= 500 && statusCode < 600,
  };
}

// ─── Adapter ───────────────────────────────────────────────

export const elevenlabsVoiceAdapter: VoiceProviderAdapter = {
  providerId: "elevenlabs",
  displayName: "ElevenLabs",

  getAvailableModels() {
    return MODELS;
  },

  async synthesizeSpeech(request: TTSRequest): Promise<TTSResponse> {
    if (!env.ELEVENLABS_API_KEY) {
      throw makeError("ElevenLabs API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const voiceId = request.voiceId ?? "21m00Tcm4TlvDq8ikWAM";
      const modelId = "eleven_turbo_v2";
      const format = request.outputFormat ?? "mp3";

      const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: request.text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("ElevenLabs TTS error", { status: resp.status, body });
        throw makeError(`ElevenLabs TTS failed: ${resp.status}`, "TTS_ERROR", resp.status);
      }

      const audioBuffer = Buffer.from(await resp.arrayBuffer());
      const audioBase64 = audioBuffer.toString("base64");

      logger.info("ElevenLabs TTS completed", { voiceId, modelId, format, latencyMs: Date.now() - startTime });
      return { audioBase64, format };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown ElevenLabs TTS error";
      logger.error("ElevenLabs TTS exception", { error: err });
      throw makeError(message, "TTS_EXCEPTION");
    }
  },

  async transcribeSpeech(request: STTRequest): Promise<STTResponse> {
    if (!env.ELEVENLABS_API_KEY) {
      throw makeError("ElevenLabs API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const audioBuffer = Buffer.from(request.audioBase64, "base64");
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("audio", blob, "audio.wav");

      if (request.language) {
        formData.append("language_code", request.language);
      }

      const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
        },
        body: formData,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("ElevenLabs STT error", { status: resp.status, body });
        throw makeError(`ElevenLabs STT failed: ${resp.status}`, "STT_ERROR", resp.status);
      }

      const data = await resp.json();
      logger.info("ElevenLabs STT completed", { latencyMs: Date.now() - startTime });

      return {
        transcript: data.text ?? "",
        confidence: data.confidence ?? 0.9,
        language: data.language_code ?? request.language ?? "en",
      };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown ElevenLabs STT error";
      logger.error("ElevenLabs STT exception", { error: err });
      throw makeError(message, "STT_EXCEPTION");
    }
  },

  async speechToSpeech(request: STSRequest): Promise<TTSResponse> {
    if (!env.ELEVENLABS_API_KEY) {
      throw makeError("ElevenLabs API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const voiceId = request.targetVoiceId ?? "21m00Tcm4TlvDq8ikWAM";
      const audioBuffer = Buffer.from(request.audioBase64, "base64");
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("audio", blob, "audio.wav");
      formData.append("model_id", "eleven_english_v2");
      formData.append("voice_settings", JSON.stringify({
        stability: 0.5,
        similarity_boost: 0.75,
      }));

      const resp = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
        },
        body: formData,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("ElevenLabs STS error", { status: resp.status, body });
        throw makeError(`ElevenLabs STS failed: ${resp.status}`, "STS_ERROR", resp.status);
      }

      const audioBuffer2 = Buffer.from(await resp.arrayBuffer());
      const audioBase64 = audioBuffer2.toString("base64");

      logger.info("ElevenLabs STS completed", { voiceId, latencyMs: Date.now() - startTime });
      return { audioBase64, format: "mp3" };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown ElevenLabs STS error";
      logger.error("ElevenLabs STS exception", { error: err });
      throw makeError(message, "STS_EXCEPTION");
    }
  },

  async cloneVoice(request: CloneVoiceRequest): Promise<VoiceCloneResponse> {
    if (!env.ELEVENLABS_API_KEY) {
      throw makeError("ElevenLabs API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const audioBuffer = Buffer.from(request.audioBase64, "base64");
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("name", request.name);
      formData.append("files", blob, "sample.wav");
      formData.append("description", request.description ?? "");

      const resp = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
        },
        body: formData,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("ElevenLabs clone error", { status: resp.status, body });
        throw makeError(`ElevenLabs clone failed: ${resp.status}`, "CLONE_ERROR", resp.status);
      }

      const data = await resp.json();
      const providerVoiceId = data.voice_id ?? "";

      logger.info("ElevenLabs clone completed", { name: request.name, providerVoiceId, latencyMs: Date.now() - startTime });
      return { voiceProfileId: "", providerVoiceId };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown ElevenLabs clone error";
      logger.error("ElevenLabs clone exception", { error: err });
      throw makeError(message, "CLONE_EXCEPTION");
    }
  },

  async translateAudio(_request: TranslateAudioRequest): Promise<TTSResponse> {
    throw makeError("ElevenLabs does not support audio translation", "TRANSLATE_NOT_SUPPORTED", 400);
  },
};
