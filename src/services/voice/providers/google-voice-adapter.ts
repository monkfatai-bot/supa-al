/**
 * Google Cloud TTS / STT adapter — via GOOGLE_AI_API_KEY.
 * Uses Google AI API endpoints for text-to-speech and speech-to-text.
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

const GOOGLE_TTS_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "el", "he",
  "id", "ms", "th", "vi", "uk", "cs", "ro", "hu", "sk", "bg",
  "bn", "ca", "hr", "ka", "lt", "lv", "mr", "sr", "sl", "su", "sw",
  "ta", "te", "ur", "uz", "af", "am", "az", "eu", "be", "gu",
  "hy", "is", "kn", "ml", "mn", "my", "ne", "pa", "si", "et",
];

const MODELS: VoiceModelInfo[] = [
  {
    id: "google-cloud-tts",
    name: "Google Cloud TTS",
    provider: "google-voice",
    description: "Google Cloud text-to-speech with WaveNet and 40+ languages",
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
];

// ─── Helpers ────────────────────────────────────────────────

function makeError(message: string, code: string, statusCode?: number): VoiceGenerationError {
  return {
    message,
    code,
    provider: "google-voice",
    statusCode,
    retryable: statusCode !== undefined && statusCode >= 500 && statusCode < 600,
  };
}

/** Map output format to Google audioEncoding enum. */
function mapAudioEncoding(format?: string): string {
  const map: Record<string, string> = {
    mp3: "MP3",
    wav: "LINEAR16",
    ogg: "OGG_OPUS",
  };
  return map[format ?? "mp3"] ?? "MP3";
}

/** Map language code to a Google voice name. */
function getGoogleVoiceName(language: string, gender?: string): string {
  const langCode = language.split("-")[0];
  const genderSuffix = gender === "male" ? "-Wavenet-A" : "-Wavenet-A";
  return `${langCode}-Standard${genderSuffix}`;
}

// ─── Adapter ───────────────────────────────────────────────

export const googleVoiceAdapter: VoiceProviderAdapter = {
  providerId: "google-voice",
  displayName: "Google Cloud TTS",

  getAvailableModels() {
    return MODELS;
  },

  async synthesizeSpeech(request: TTSRequest): Promise<TTSResponse> {
    if (!env.GOOGLE_AI_API_KEY) {
      throw makeError("Google AI API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const language = request.language ?? "en";
      const encoding = mapAudioEncoding(request.outputFormat);
      const voiceName = getGoogleVoiceName(language, request.voiceId);
      const apiKey = env.GOOGLE_AI_API_KEY;

      const resp = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: request.text },
            voice: {
              languageCode: language,
              name: voiceName,
            },
            audioConfig: {
              audioEncoding: encoding,
              speakingRate: request.speed ?? 1.0,
              pitch: (request.pitch ?? 1.0) - 1.0,
              volumeGainDb: ((request.volume ?? 1.0) - 1.0) * 20,
            },
          }),
        }
      );

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("Google TTS error", { status: resp.status, body });
        throw makeError(`Google TTS failed: ${resp.status}`, "TTS_ERROR", resp.status);
      }

      const data = await resp.json();
      const audioBase64 = data.audioContent ?? "";

      logger.info("Google TTS completed", { language, voiceName, encoding, latencyMs: Date.now() - startTime });
      return { audioBase64, format: request.outputFormat ?? "mp3" };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown Google TTS error";
      logger.error("Google TTS exception", { error: err });
      throw makeError(message, "TTS_EXCEPTION");
    }
  },

  async transcribeSpeech(request: STTRequest): Promise<STTResponse> {
    if (!env.GOOGLE_AI_API_KEY) {
      throw makeError("Google AI API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const apiKey = env.GOOGLE_AI_API_KEY;

      const resp = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio: {
              content: request.audioBase64,
            },
            config: {
              encoding: "LINEAR16",
              sampleRateHertz: request.sampleRate ?? 16000,
              languageCode: request.language ?? "en-US",
              enableSpeakerDiarization: request.enableDiarization ?? false,
              enableWordTimeOffsets: request.enableTimestamps ?? false,
            },
          }),
        }
      );

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("Google STT error", { status: resp.status, body });
        throw makeError(`Google STT failed: ${resp.status}`, "STT_ERROR", resp.status);
      }

      const data = await resp.json();
      const results = data.results ?? [];
      let transcript = "";
      let confidence = 0;
      const timestamps: Array<{ word: string; start: number; end: number }> = [];

      for (const result of results) {
        const alternative = result.alternatives?.[0];
        if (alternative) {
          transcript += (alternative.transcript ?? "") + " ";
          confidence = Math.max(confidence, alternative.confidence ?? 0);

          if (alternative.words) {
            for (const word of alternative.words) {
              timestamps.push({
                word: word.word ?? "",
                start: (word.startTime?.seconds ?? 0) + (word.startTime?.nanos ?? 0) / 1e9,
                end: (word.endTime?.seconds ?? 0) + (word.endTime?.nanos ?? 0) / 1e9,
              });
            }
          }
        }
      }

      logger.info("Google STT completed", { latencyMs: Date.now() - startTime });
      return {
        transcript: transcript.trim(),
        confidence,
        language: request.language ?? "en",
        timestamps: timestamps.length > 0 ? timestamps : undefined,
      };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown Google STT error";
      logger.error("Google STT exception", { error: err });
      throw makeError(message, "STT_EXCEPTION");
    }
  },

  async speechToSpeech(_request: STSRequest): Promise<TTSResponse> {
    throw makeError("Google Cloud does not support speech-to-speech", "STS_NOT_SUPPORTED", 400);
  },

  async cloneVoice(_request: CloneVoiceRequest): Promise<VoiceCloneResponse> {
    throw makeError("Google Cloud does not support voice cloning", "CLONE_NOT_SUPPORTED", 400);
  },

  async translateAudio(_request: TranslateAudioRequest): Promise<TTSResponse> {
    throw makeError("Google Cloud audio translation not yet implemented", "TRANSLATE_NOT_IMPLEMENTED", 501);
  },
};
