/**
 * PlayHT TTS adapter — TTS with voice cloning and speech-to-speech.
 * Uses PLAYHT_API_KEY and PLAYHT_USER_ID.
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
} from "../types";

// ─── Models ────────────────────────────────────────────────

const PLAYHT_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "pl", "ru", "ja", "ko", "zh",
  "ar", "hi", "tr", "id", "uk", "fi", "sv", "da", "no", "cs", "vi", "th",
];

const MODELS: VoiceModelInfo[] = [
  {
    id: "playht-2.0",
    name: "PlayHT 2.0",
    provider: "playht",
    description: "PlayHT TTS with voice cloning and speech-to-speech capabilities",
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
    supportedSampleRates: [8000, 16000, 22050, 24000, 44100, 48000],
    enabled: true,
  },
];

// ─── Helpers ────────────────────────────────────────────────

function makeError(message: string, code: string, statusCode?: number): VoiceGenerationError {
  return {
    message,
    code,
    provider: "playht",
    statusCode,
    retryable: statusCode !== undefined && statusCode >= 500 && statusCode < 600,
  };
}

// ─── Adapter ───────────────────────────────────────────────

export const playhtVoiceAdapter: VoiceProviderAdapter = {
  providerId: "playht",
  displayName: "PlayHT",

  getAvailableModels() {
    return MODELS;
  },

  async synthesizeSpeech(request: TTSRequest): Promise<TTSResponse> {
    if (!env.PLAYHT_API_KEY || !env.PLAYHT_USER_ID) {
      throw makeError("PlayHT API credentials not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const format = request.outputFormat ?? "mp3";

      const resp = await fetch("https://api.play.ht/api/v2/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PLAYHT_API_KEY}`,
          "X-USER-ID": env.PLAYHT_USER_ID,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: request.text,
          voice: request.voiceId ?? "lily",
          output_format: format,
          quality: "premium",
          speed: request.speed ?? 1.0,
          sample_rate: request.sampleRate ?? 24000,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("PlayHT TTS error", { status: resp.status, body });
        throw makeError(`PlayHT TTS failed: ${resp.status}`, "TTS_ERROR", resp.status);
      }

      const audioBuffer = Buffer.from(await resp.arrayBuffer());
      const audioBase64 = audioBuffer.toString("base64");

      logger.info("PlayHT TTS completed", { voiceId: request.voiceId, format, latencyMs: Date.now() - startTime });
      return { audioBase64, format };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown PlayHT TTS error";
      logger.error("PlayHT TTS exception", { error: err });
      throw makeError(message, "TTS_EXCEPTION");
    }
  },

  async transcribeSpeech(_request: STTRequest): Promise<STTResponse> {
    throw makeError("PlayHT does not support speech-to-text", "STT_NOT_SUPPORTED", 400);
  },

  async speechToSpeech(request: STSRequest): Promise<TTSResponse> {
    if (!env.PLAYHT_API_KEY || !env.PLAYHT_USER_ID) {
      throw makeError("PlayHT API credentials not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const audioBuffer = Buffer.from(request.audioBase64, "base64");
      const formData = new FormData();
      formData.append("audio", new Blob([audioBuffer], { type: "audio/wav" }), "audio.wav");
      formData.append("voice_id", request.targetVoiceId ?? "lily");

      const resp = await fetch("https://api.play.ht/api/v2/cloning/sts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PLAYHT_API_KEY}`,
          "X-USER-ID": env.PLAYHT_USER_ID,
        },
        body: formData,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("PlayHT STS error", { status: resp.status, body });
        throw makeError(`PlayHT STS failed: ${resp.status}`, "STS_ERROR", resp.status);
      }

      const resultBuffer = Buffer.from(await resp.arrayBuffer());
      const audioBase64 = resultBuffer.toString("base64");

      logger.info("PlayHT STS completed", { latencyMs: Date.now() - startTime });
      return { audioBase64, format: "mp3" };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown PlayHT STS error";
      logger.error("PlayHT STS exception", { error: err });
      throw makeError(message, "STS_EXCEPTION");
    }
  },

  async cloneVoice(request: CloneVoiceRequest): Promise<VoiceCloneResponse> {
    if (!env.PLAYHT_API_KEY || !env.PLAYHT_USER_ID) {
      throw makeError("PlayHT API credentials not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const audioBuffer = Buffer.from(request.audioBase64, "base64");
      const formData = new FormData();
      formData.append("sample", new Blob([audioBuffer], { type: "audio/wav" }), "sample.wav");
      formData.append("name", request.name);

      if (request.description) {
        formData.append("description", request.description);
      }

      const resp = await fetch("https://api.play.ht/api/v2/cloning/clone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PLAYHT_API_KEY}`,
          "X-USER-ID": env.PLAYHT_USER_ID,
        },
        body: formData,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("PlayHT clone error", { status: resp.status, body });
        throw makeError(`PlayHT clone failed: ${resp.status}`, "CLONE_ERROR", resp.status);
      }

      const data = await resp.json();
      const providerVoiceId = data.id ?? "";

      logger.info("PlayHT clone completed", { name: request.name, providerVoiceId, latencyMs: Date.now() - startTime });
      return { voiceProfileId: "", providerVoiceId };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown PlayHT clone error";
      logger.error("PlayHT clone exception", { error: err });
      throw makeError(message, "CLONE_EXCEPTION");
    }
  },

  async translateAudio(_request: TranslateAudioRequest): Promise<TTSResponse> {
    throw makeError("PlayHT does not support audio translation", "TRANSLATE_NOT_SUPPORTED", 400);
  },
};
