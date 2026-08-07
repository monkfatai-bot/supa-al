/**
 * Supa AI — Deepgram voice provider (STT only).
 *
 * Deepgram is a speech-to-text specialist. Uses the public REST API
 * (`https://api.deepgram.com/v1/listen`). API key from
 * `DEEPGRAM_API_KEY`.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-providers/deepgram
 */
import "server-only";

import type {
  TranscribeRequest,
  TranscribeResult,
  TranscriptSegment,
  VoiceModelInfo,
} from "../voice-types";
import { BaseVoiceProvider } from "../voice-base";

const API_BASE = "https://api.deepgram.com/v1";

const DEFAULT_MODEL = "nova-2";

const MODELS: VoiceModelInfo[] = [
  {
    id: "nova-2",
    label: "Deepgram Nova-2",
    provider: "deepgram",
    type: "stt",
    description: "State-of-the-art STT with fast + accurate transcription.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"],
    supportedVoices: [],
    streaming: true,
    costCentsPer1K: 4.3,
  },
  {
    id: "nova-3",
    label: "Deepgram Nova-3",
    provider: "deepgram",
    type: "stt",
    description: "Latest Nova model with improved accuracy and features.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE"],
    supportedVoices: [],
    streaming: true,
    costCentsPer1K: 5.5,
  },
];

export class DeepgramVoiceProvider extends BaseVoiceProvider {
  readonly id = "deepgram" as const;
  readonly capabilities = {
    tts: false,
    stt: true,
    translate: false,
    dub: false,
    clone: false,
  };

  private get apiKey(): string {
    const k = process.env.DEEPGRAM_API_KEY;
    if (!k) throw new Error("DEEPGRAM_API_KEY is not set.");
    return k;
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const model = req.model ?? DEFAULT_MODEL;
    try {
      const params = new URLSearchParams({
        model,
        smart_format: "true",
        punctuate: "true",
        diarize: req.speakerLabels ? "true" : "false",
        utterances: "true",
      });
      if (req.language) params.set("language", req.language);

      const res = await fetch(`${API_BASE}/listen?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.apiKey}`,
          "Content-Type": req.mimeType,
        },
        body: req.audio,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Deepgram STT failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as {
        results?: {
          channels?: Array<{
            alternatives?: Array<{
              transcript?: string;
              confidence?: number;
              words?: Array<{
                word?: string;
                start?: number;
                end?: number;
                confidence?: number;
              }>;
            }>;
          }>;
          utterances?: Array<{
            start?: number;
            end?: number;
            transcript?: string;
            speaker?: number;
            confidence?: number;
          }>;
        };
      };
      const alt = json.results?.channels?.[0]?.alternatives?.[0];
      const text = alt?.transcript ?? "";
      const confidence = alt?.confidence ?? undefined;
      const segments: TranscriptSegment[] | undefined = json.results?.utterances?.length
        ? json.results.utterances.map((u) => ({
            start: u.start ?? 0,
            end: u.end ?? 0,
            text: u.transcript ?? "",
            speaker: u.speaker !== undefined ? String(u.speaker) : undefined,
            confidence: u.confidence,
          }))
        : alt?.words?.length
          ? [
              {
                start: alt.words[0]?.start ?? 0,
                end: alt.words[alt.words.length - 1]?.end ?? 0,
                text,
                confidence,
                words: alt.words.map((w) => ({
                  word: w.word ?? "",
                  start: w.start ?? 0,
                  end: w.end ?? 0,
                  confidence: w.confidence,
                })),
              },
            ]
          : undefined;

      return {
        text,
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
