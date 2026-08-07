/**
 * Supa AI — Google voice provider (TTS via Gemini + STT via Chirp).
 *
 * Uses the same `@google/generative-ai` SDK as the chat provider. STT
 * uses the public Cloud Speech-to-Text v2 REST endpoint (no separate
 * SDK required — `fetch` keeps the dependency footprint minimal).
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-providers/google
 */
import "server-only";

import type {
  SynthesizeRequest,
  SynthesizeResult,
  TranscribeRequest,
  TranscribeResult,
  TranscriptSegment,
  VoiceModelInfo,
} from "../voice-types";
import { BaseVoiceProvider } from "../voice-base";

const STT_BASE = "https://speech.googleapis.com/v1";

const DEFAULT_TTS_MODEL = "gemini-2.0-flash-tts";
const DEFAULT_STT_MODEL = "chirp-2";

const MODELS: VoiceModelInfo[] = [
  {
    id: "gemini-2.0-flash-tts",
    label: "Google Gemini TTS",
    provider: "google",
    type: "tts",
    description: "Natural-voice TTS via the Gemini API.",
    supportedLanguages: ["en-US", "es-ES", "fr-FR", "de-DE", "it-IT", "ja-JP", "zh-CN"],
    supportedVoices: [
      { id: "charon", label: "Charon", language: "en-US", gender: "male" },
      { id: "fenrir", label: "Fenrir", language: "en-US", gender: "male" },
      { id: "kore", label: "Kore", language: "en-US", gender: "female" },
      { id: "puck", label: "Puck", language: "en-US", gender: "male" },
    ],
    costCentsPer1K: 1,
    streaming: true,
  },
  {
    id: "chirp-2",
    label: "Google Chirp 2",
    provider: "google",
    type: "stt",
    description: "Cloud Speech-to-Text Chirp model.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN", "ko-KR"],
    supportedVoices: [],
    costCentsPer1K: 4,
    metadata: { batch_supported: true },
  },
];

export class GoogleVoiceProvider extends BaseVoiceProvider {
  readonly id = "google" as const;
  readonly capabilities = {
    tts: true,
    stt: true,
    translate: false,
    dub: false,
    clone: false,
  };

  private get apiKey(): string {
    const k = process.env.GOOGLE_VOICE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!k) throw new Error("GOOGLE_VOICE_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) is not set.");
    return k;
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const model = req.model ?? DEFAULT_TTS_MODEL;
    try {
      // The Gemini TTS preview is exposed via generateContent with a
      // responseModalities of ["AUDIO"]. We use the REST endpoint directly.
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const body = {
        contents: [
          {
            parts: [{ text: req.text }],
            role: "user",
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: req.voiceId },
            },
          },
        },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google TTS failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
          };
        }>;
      };
      const audioPart = json.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data,
      );
      if (!audioPart?.inlineData?.data) {
        throw new Error("Google TTS returned no audio data.");
      }
      const audio = Buffer.from(audioPart.inlineData.data, "base64");
      return {
        audio: audio.buffer.slice(
          audio.byteOffset,
          audio.byteOffset + audio.byteLength,
        ),
        mimeType: audioPart.inlineData.mimeType ?? "audio/mpeg",
        format: "mp3",
        raw: json,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "synthesize", model, voiceId: req.voiceId });
    }
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const model = req.model ?? DEFAULT_STT_MODEL;
    try {
      const audioB64 = Buffer.from(req.audio).toString("base64");
      const url = `${STT_BASE}/speech:recognize?key=${encodeURIComponent(this.apiKey)}`;
      const body = {
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: 16000,
          languageCode: req.language ?? "en-US",
          model: model,
          enableWordTimeOffsets: !!req.wordTimestamps,
          enableSpeakerDiarization: !!req.speakerLabels,
        },
        audio: { content: audioB64 },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google STT failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as {
        results?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
            words?: Array<{ word?: string; startTime?: string; endTime?: string }>;
          }>;
        }>;
      };
      const alternatives = json.results?.[0]?.alternatives ?? [];
      const transcript = alternatives.map((a) => a.transcript ?? "").join(" ");
      const confidence = alternatives[0]?.confidence ?? undefined;
      const segments: TranscriptSegment[] | undefined = alternatives[0]?.words?.length
        ? [
            {
              start: parseDuration(alternatives[0].words?.[0]?.startTime ?? "0s"),
              end: parseDuration(
                alternatives[0].words?.[alternatives[0].words.length - 1]?.endTime ?? "0s",
              ),
              text: transcript,
              words: alternatives[0].words?.map((w) => ({
                word: w.word ?? "",
                start: parseDuration(w.startTime ?? "0s"),
                end: parseDuration(w.endTime ?? "0s"),
              })),
            },
          ]
        : undefined;
      return {
        text: transcript,
        language: req.language,
        confidence,
        segments,
        raw: json,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "transcribe", model });
    }
  }

  async listModels(): Promise<VoiceModelInfo[]> {
    return MODELS;
  }
}

function parseDuration(s: string): number {
  // Google returns "1.500s" — strip the trailing `s` and parseFloat.
  const n = parseFloat(s.replace(/s$/, ""));
  return Number.isFinite(n) ? n : 0;
}
