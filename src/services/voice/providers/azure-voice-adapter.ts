/**
 * Azure AI Speech adapter — TTS via SSML + STT via REST.
 * Uses AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.
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

const AZURE_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "ko", "zh",
  "ar", "hi", "pl", "sv", "da", "fi", "no", "tr", "el", "he",
  "id", "ms", "th", "vi", "uk", "cs", "ro", "hu", "sk", "bg",
  "bn", "ca", "hr", "et", "fil", "gu", "is", "kn", "lt", "lv",
  "ml", "mr", "ne", "pa", "si", "sw", "ta", "te", "ur",
  "af", "am", "az", "eu", "be", "hy", "ka", "mk", "mn", "my",
  "or", "sr", "su", "uz",
];

const MODELS: VoiceModelInfo[] = [
  {
    id: "azure-neural-tts",
    name: "Azure Neural TTS",
    provider: "azure-voice",
    description: "Microsoft Azure AI Speech with neural voices, 100+ languages",
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
];

// ─── Helpers ────────────────────────────────────────────────

function makeError(message: string, code: string, statusCode?: number): VoiceGenerationError {
  return {
    message,
    code,
    provider: "azure-voice",
    statusCode,
    retryable: statusCode !== undefined && statusCode >= 500 && statusCode < 600,
  };
}

/** Map language to an Azure neural voice name. */
function getAzureVoiceName(_language: string, gender?: string): string {
  const g = gender === "female" ? "Female" : "Male";
  return `en-US-${g === "Female" ? "Aria" : "Davis"}Neural`;
}

/** Build SSML for Azure TTS. */
function buildSsml(text: string, language: string, gender?: string): string {
  const voiceName = getAzureVoiceName(language, gender);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${language}'>
  <voice name='${voiceName}'>
    ${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
  </voice>
</speak>`;
}

// ─── Adapter ───────────────────────────────────────────────

export const azureVoiceAdapter: VoiceProviderAdapter = {
  providerId: "azure-voice",
  displayName: "Azure AI Speech",

  getAvailableModels() {
    return MODELS;
  },

  async synthesizeSpeech(request: TTSRequest): Promise<TTSResponse> {
    if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
      throw makeError("Azure Speech credentials not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const region = env.AZURE_SPEECH_REGION;
      const language = request.language ?? "en-US";
      const format = request.outputFormat ?? "mp3";
      const ssml = buildSsml(request.text, language, request.voiceId);

      const resp = await fetch(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": format === "ogg" ? "ogg-48khz-16bit-mono-opus" : "audio-16khz-128kbps-mono-mp3",
            "User-Agent": "supa-ai-voice",
          },
          body: ssml,
        }
      );

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("Azure TTS error", { status: resp.status, body });
        throw makeError(`Azure TTS failed: ${resp.status}`, "TTS_ERROR", resp.status);
      }

      const audioBuffer = Buffer.from(await resp.arrayBuffer());
      const audioBase64 = audioBuffer.toString("base64");

      logger.info("Azure TTS completed", { language, format, latencyMs: Date.now() - startTime });
      return { audioBase64, format };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown Azure TTS error";
      logger.error("Azure TTS exception", { error: err });
      throw makeError(message, "TTS_EXCEPTION");
    }
  },

  async transcribeSpeech(request: STTRequest): Promise<STTResponse> {
    if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
      throw makeError("Azure Speech credentials not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      const region = env.AZURE_SPEECH_REGION;
      const language = request.language ?? "en-US";

      const resp = await fetch(
        `https://${region}.api.cognitive.microsoft.com/sts/speech/recognition/conversation/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
            "Content-Type": "audio/wav",
            "Accept": "application/json",
          },
          body: Buffer.from(request.audioBase64, "base64"),
        }
      );

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error("Azure STT error", { status: resp.status, body });
        throw makeError(`Azure STT failed: ${resp.status}`, "STT_ERROR", resp.status);
      }

      const data = await resp.json();
      const recognitionResults = data.NBest?.[0];
      const transcript = recognitionResults?.Display ?? recognitionResults?.Lexical ?? "";

      logger.info("Azure STT completed", { language, latencyMs: Date.now() - startTime });
      return {
        transcript,
        confidence: recognitionResults?.Confidence ?? 0.9,
        language,
      };
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown Azure STT error";
      logger.error("Azure STT exception", { error: err });
      throw makeError(message, "STT_EXCEPTION");
    }
  },

  async speechToSpeech(_request: STSRequest): Promise<TTSResponse> {
    throw makeError("Azure Speech does not support speech-to-speech", "STS_NOT_SUPPORTED", 400);
  },

  async cloneVoice(_request: CloneVoiceRequest): Promise<VoiceCloneResponse> {
    throw makeError("Azure Speech does not support voice cloning", "CLONE_NOT_SUPPORTED", 400);
  },

  async translateAudio(_request: TranslateAudioRequest): Promise<TTSResponse> {
    throw makeError("Azure audio translation not yet implemented", "TRANSLATE_NOT_IMPLEMENTED", 501);
  },
};
