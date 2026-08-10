/**
 * AssemblyAI STT adapter — poll-based transcription with diarization,
 * chapters, timestamps, and speaker labels.
 * Uses ASSEMBLYAI_API_KEY.
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

const ASSEMBLYAI_LANGS = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ja", "zh",
  "ar", "hi", "ko", "tr", "pl", "uk", "ru", "vi", "th",
];

const MODELS: VoiceModelInfo[] = [
  {
    id: "assemblyai-best",
    name: "AssemblyAI Universal",
    provider: "assemblyai",
    description: "AssemblyAI STT with diarization, chapters, and word-level timestamps",
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
    supportedFormats: ["mp3", "wav", "ogg", "flac", "aac", "m4a", "webm"],
    supportedSampleRates: [16000, 22050, 24000, 44100, 48000],
    enabled: true,
  },
];

// ─── Helpers ────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 120_000;

function makeError(message: string, code: string, statusCode?: number): VoiceGenerationError {
  return {
    message,
    code,
    provider: "assemblyai",
    statusCode,
    retryable: statusCode !== undefined && statusCode >= 500 && statusCode < 600,
  };
}

// ─── Adapter ───────────────────────────────────────────────

export const assemblyaiVoiceAdapter: VoiceProviderAdapter = {
  providerId: "assemblyai",
  displayName: "AssemblyAI",

  getAvailableModels() {
    return MODELS;
  },

  async synthesizeSpeech(_request: TTSRequest): Promise<TTSResponse> {
    throw makeError("AssemblyAI does not support text-to-speech", "TTS_NOT_SUPPORTED", 400);
  },

  async transcribeSpeech(request: STTRequest): Promise<STTResponse> {
    if (!env.ASSEMBLYAI_API_KEY) {
      throw makeError("AssemblyAI API key not configured", "MISSING_API_KEY", 400);
    }

    const startTime = Date.now();
    try {
      // Submit transcription job
      const submitResp = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: {
          Authorization: env.ASSEMBLYAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio: `data:audio/wav;base64,${request.audioBase64}`,
          language_code: request.language ?? null,
          speaker_labels: request.enableDiarization ?? false,
          summarization: request.enableChapters
            ? { type: "informative", model: "conversational" }
            : undefined,
        }),
      });

      if (!submitResp.ok) {
        const body = await submitResp.text().catch(() => "");
        logger.error("AssemblyAI submit error", { status: submitResp.status, body });
        throw makeError(`AssemblyAI submit failed: ${submitResp.status}`, "STT_ERROR", submitResp.status);
      }

      const submitData = await submitResp.json();
      const transcriptId = submitData.id;

      if (!transcriptId) {
        throw makeError("No transcript ID returned by AssemblyAI", "STT_NO_ID");
      }

      // Poll for completion
      const result = await pollTranscript(transcriptId, startTime);

      logger.info("AssemblyAI STT completed", {
        transcriptId,
        language: result.language,
        latencyMs: Date.now() - startTime,
      });
      return result;
    } catch (err) {
      if ("code" in (err as object)) throw err;
      const message = err instanceof Error ? err.message : "Unknown AssemblyAI STT error";
      logger.error("AssemblyAI STT exception", { error: err });
      throw makeError(message, "STT_EXCEPTION");
    }
  },

  async speechToSpeech(_request: STSRequest): Promise<TTSResponse> {
    throw makeError("AssemblyAI does not support speech-to-speech", "STS_NOT_SUPPORTED", 400);
  },

  async cloneVoice(_request: CloneVoiceRequest): Promise<VoiceCloneResponse> {
    throw makeError("AssemblyAI does not support voice cloning", "CLONE_NOT_SUPPORTED", 400);
  },

  async translateAudio(_request: TranslateAudioRequest): Promise<TTSResponse> {
    throw makeError("AssemblyAI does not support audio translation", "TRANSLATE_NOT_SUPPORTED", 400);
  },
};

// ─── Internal poller ───────────────────────────────────────

async function pollTranscript(
  transcriptId: string,
  _submitTime: number
): Promise<STTResponse> {
  const pollStart = Date.now();

  while (Date.now() - pollStart < MAX_POLL_DURATION_MS) {
    const resp = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { Authorization: env.ASSEMBLYAI_API_KEY! },
    });

    if (!resp.ok) {
      throw makeError(`AssemblyAI poll failed: ${resp.status}`, "STT_POLL_ERROR", resp.status);
    }

    const data = await resp.json();

    if (data.status === "completed") {
      // Extract timestamps
      const timestamps: Array<{ word: string; start: number; end: number }> = [];
      if (data.words) {
        for (const word of data.words) {
          timestamps.push({
            word: word.text ?? "",
            start: (word.start ?? 0) / 1000,
            end: (word.end ?? 0) / 1000,
          });
        }
      }

      // Extract speaker labels
      const speakerLabels: Array<{ speaker: string; start: number; end: number }> = [];
      if (data.utterances) {
        for (const utterance of data.utterances) {
          speakerLabels.push({
            speaker: utterance.speaker ?? "0",
            start: (utterance.start ?? 0) / 1000,
            end: (utterance.end ?? 0) / 1000,
          });
        }
      }

      // Extract chapters
      const chapters: Array<{ start: number; end: number; headline: string; summary: string }> = [];
      if (data.chapters) {
        for (const chapter of data.chapters) {
          chapters.push({
            start: (chapter.start ?? 0) / 1000,
            end: (chapter.end ?? 0) / 1000,
            headline: chapter.headline ?? "",
            summary: chapter.summary ?? "",
          });
        }
      }

      return {
        transcript: data.text ?? "",
        confidence: data.confidence ?? 0.9,
        language: data.language_code ?? "en",
        timestamps: timestamps.length > 0 ? timestamps : undefined,
        speakerLabels: speakerLabels.length > 0 ? speakerLabels : undefined,
        chapters: chapters.length > 0 ? chapters : undefined,
      };
    }

    if (data.status === "error") {
      throw makeError(data.error ?? "AssemblyAI transcription failed", "STT_FAILED");
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw makeError("AssemblyAI transcription timed out", "STT_TIMEOUT");
}
