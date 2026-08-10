/**
 * Deepgram STT adapter — nova-2 model with diarization, timestamps, etc.
 * Uses DEEPGRAM_API_KEY.
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

const DEEPGRAM_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "uk", "cs", "ro",
  "hu", "vi", "th", "ms", "id", "bg",
];

const MODELS: VoiceModelInfo[] = [
  {
    id: "deepgram-nova-2",
    name: "Deepgram Nova-2",
    provider: "deepgram",
    description: "Deepgram's state-of-the-art STT with speaker diarization and fast latency",
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
    supportedFormats: ["mp3", "wav", "ogg", "flac", "aac", "m4a", "webm"],
    supportedSampleRates: [8000, 16000, 22050, 24000, 44100, 48000],
    enabled: true,
  },
];

// ─── Helpers ────────────────────────────────────────────────

function makeError(message: string, code: string, statusCode?: number): VoiceGenerationError {
  return {
    message,
    code,
    provider: "deepgram",
    statusCode,
    retryable: statusCode !== undefined && statusCode >= 500 && statusCode < 600,
  };
}

// ─── Adapter ───────────────────────────────────────────────

export const deepgramVoiceAdapter: VoiceProviderAdapter = {
  providerId: "deepgram",
  displayName: "Deepgram",

  getAvailableModels() {
    return MODELS;
  },

  async synthesizeSpeech(_request: TTSRequest): Promise<TTSResponse> {
    throw makeError("Deepgram does not support text-to-speech", "TTS_NOT_SUPPORTED", 400);
  },

  async transcribeSpeech(request: STTRequest): Promise<STTResponse> {
    if (!env.DEEPGRAM_API_KEY) {
      throw makeError("Deepgram API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const language = request.language ?? "en";
      const params = new URLSearchParams({
        model: "nova-2",
        language: language,
        smart_format: "true",
        punctuate: "true",
        ...(request.enableDiarization ? { diarize: "true" } : {}),
        ...(request.enableTimestamps ? { diarize: "true" } : {}),
      });

      const audioBuffer = Buffer.from(request.audioBase64, "base64");

      const resp = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
          "Content-Type": "audio/wav",
        },
        body: audioBuffer,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("Deepgram STT error", { status: resp.status, body });
        throw makeError(`Deepgram STT failed: ${resp.status}`, "STT_ERROR", resp.status);
      }

      const data = await resp.json();
      const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      const confidence = data.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? 0.9;

      // Extract timestamps if available
      const timestamps: Array<{ word: string; start: number; end: number }> = [];
      const words = data.results?.channels?.[0]?.alternatives?.[0]?.words;
      if (words) {
        for (const word of words) {
          timestamps.push({
            word: word.word ?? "",
            start: word.start ?? 0,
            end: word.end ?? 0,
          });
        }
      }

      // Extract speaker labels if diarization enabled
      const speakerLabels: Array<{ speaker: string; start: number; end: number }> = [];
      const diarizedWords = data.results?.channels?.[0]?.alternatives?.[0]?.words;
      if (diarizedWords && diarizedWords[0]?.speaker) {
        for (const word of diarizedWords) {
          speakerLabels.push({
            speaker: String(word.speaker ?? 0),
            start: word.start ?? 0,
            end: word.end ?? 0,
          });
        }
      }

      logger.info("Deepgram STT completed", { language, latencyMs: Date.now() - startTime });
      return {
        transcript,
        confidence: parseFloat(String(confidence)),
        language,
        timestamps: timestamps.length > 0 ? timestamps : undefined,
        speakerLabels: speakerLabels.length > 0 ? speakerLabels : undefined,
      };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown Deepgram STT error";
      logger.error("Deepgram STT exception", { error: err });
      throw makeError(message, "STT_EXCEPTION");
    }
  },

  async speechToSpeech(_request: STSRequest): Promise<TTSResponse> {
    throw makeError("Deepgram does not support speech-to-speech", "STS_NOT_SUPPORTED", 400);
  },

  async cloneVoice(_request: CloneVoiceRequest): Promise<VoiceCloneResponse> {
    throw makeError("Deepgram does not support voice cloning", "CLONE_NOT_SUPPORTED", 400);
  },

  async translateAudio(_request: TranslateAudioRequest): Promise<TTSResponse> {
    throw makeError("Deepgram does not support audio translation", "TRANSLATE_NOT_SUPPORTED", 400);
  },
};
