/**
 * Cartesia TTS adapter — Sonic model with emotion control and voice cloning.
 * Uses CARTESIA_API_KEY.
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

const CARTESIA_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "el", "he",
  "id", "ms", "th", "vi", "uk", "cs", "ro", "hu", "sk", "bg",
];

const MODELS: VoiceModelInfo[] = [
  {
    id: "cartesia-sonic",
    name: "Cartesia Sonic",
    provider: "cartesia",
    description: "Cartesia Sonic TTS with emotion control and voice cloning",
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
  },
];

// ─── Helpers ────────────────────────────────────────────────

function makeError(message: string, code: string, statusCode?: number): VoiceGenerationError {
  return {
    message,
    code,
    provider: "cartesia",
    statusCode,
    retryable: statusCode !== undefined && statusCode >= 500 && statusCode < 600,
  };
}

// ─── Adapter ───────────────────────────────────────────────

export const cartesiaVoiceAdapter: VoiceProviderAdapter = {
  providerId: "cartesia",
  displayName: "Cartesia",

  getAvailableModels() {
    return MODELS;
  },

  async synthesizeSpeech(request: TTSRequest): Promise<TTSResponse> {
    if (!env.CARTESIA_API_KEY) {
      throw makeError("Cartesia API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const voiceId = request.voiceId ?? "7948e4da-29b2-4f1e-b64f-88a9e49a3e51";
      const format = request.outputFormat ?? "mp3";

      const resp = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "X-API-Key": env.CARTESIA_API_KEY,
          "Cartesia-Version": "2024-06-10",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "sonic-english",
          transcript: { text: request.text },
          voice: {
            mode: "id",
            id: voiceId,
          },
          output_format: {
            container: format,
            bit_rate: 128000,
          },
        }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("Cartesia TTS error", { status: resp.status, body });
        throw makeError(`Cartesia TTS failed: ${resp.status}`, "TTS_ERROR", resp.status);
      }

      const audioBuffer = Buffer.from(await resp.arrayBuffer());
      const audioBase64 = audioBuffer.toString("base64");

      logger.info("Cartesia TTS completed", { voiceId, format, latencyMs: Date.now() - startTime });
      return { audioBase64, format };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown Cartesia TTS error";
      logger.error("Cartesia TTS exception", { error: err });
      throw makeError(message, "TTS_EXCEPTION");
    }
  },

  async transcribeSpeech(_request: STTRequest): Promise<STTResponse> {
    throw makeError("Cartesia does not support speech-to-text", "STT_NOT_SUPPORTED", 400);
  },

  async speechToSpeech(_request: STSRequest): Promise<TTSResponse> {
    throw makeError("Cartesia does not support speech-to-speech", "STS_NOT_SUPPORTED", 400);
  },

  async cloneVoice(_request: CloneVoiceRequest): Promise<VoiceCloneResponse> {
    if (!env.CARTESIA_API_KEY) {
      throw makeError("Cartesia API key not configured", "MISSING_API_KEY", 400);
    }
    throw makeError("Cartesia voice cloning not yet implemented", "CLONE_NOT_IMPLEMENTED", 501);
  },

  async translateAudio(_request: TranslateAudioRequest): Promise<TTSResponse> {
    throw makeError("Cartesia does not support audio translation", "TRANSLATE_NOT_SUPPORTED", 400);
  },
};
