/**
 * Supa AI — OpenAI voice provider (TTS + STT via Whisper).
 *
 * Uses the same `openai` SDK as the chat provider so the same
 * `OPENAI_API_KEY` (or the dedicated `OPENAI_VOICE_API_KEY` override)
 * drives both surfaces.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-providers/openai
 */
import "server-only";

import OpenAI from "openai";

import type {
  SynthesizeRequest,
  SynthesizeResult,
  TranscribeRequest,
  TranscribeResult,
  TranscriptSegment,
  VoiceModelInfo,
  VoiceAudioFormat,
} from "../voice-types";
import { BaseVoiceProvider } from "../voice-base";

const DEFAULT_TTS_MODEL = "tts-1";
const DEFAULT_STT_MODEL = "whisper-1";

/** Static catalog — OpenAI ships TTS-1, TTS-1-HD, and Whisper. */
const MODELS: VoiceModelInfo[] = [
  {
    id: "tts-1",
    label: "OpenAI TTS-1",
    provider: "openai",
    type: "tts",
    description: "Fast, affordable text-to-speech for real-time use.",
    supportedLanguages: ["en-US"],
    supportedVoices: [
      { id: "alloy", label: "Alloy", language: "en-US", gender: "neutral" },
      { id: "echo", label: "Echo", language: "en-US", gender: "male" },
      { id: "fable", label: "Fable", language: "en-US", gender: "neutral" },
      { id: "onyx", label: "Onyx", language: "en-US", gender: "male" },
      { id: "nova", label: "Nova", language: "en-US", gender: "female" },
      { id: "shimmer", label: "Shimmer", language: "en-US", gender: "female" },
    ],
    costCentsPer1K: 1.5,
    metadata: { format: "mp3", speed_range: [0.25, 4] },
  },
  {
    id: "tts-1-hd",
    label: "OpenAI TTS-1 HD",
    provider: "openai",
    type: "tts",
    description: "Higher-fidelity TTS for production audio.",
    supportedLanguages: ["en-US"],
    supportedVoices: [
      { id: "alloy", label: "Alloy", language: "en-US", gender: "neutral" },
      { id: "echo", label: "Echo", language: "en-US", gender: "male" },
      { id: "fable", label: "Fable", language: "en-US", gender: "neutral" },
      { id: "onyx", label: "Onyx", language: "en-US", gender: "male" },
      { id: "nova", label: "Nova", language: "en-US", gender: "female" },
      { id: "shimmer", label: "Shimmer", language: "en-US", gender: "female" },
    ],
    costCentsPer1K: 3,
    metadata: { format: "mp3", speed_range: [0.25, 4] },
  },
  {
    id: "whisper-1",
    label: "OpenAI Whisper",
    provider: "openai",
    type: "stt",
    description: "General-purpose speech-to-text in 50+ languages.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"],
    supportedVoices: [],
    costCentsPer1K: 0.6,
    metadata: { max_file_size_mb: 25 },
  },
];

const FORMAT_TO_MIME: Record<VoiceAudioFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  pcm: "audio/pcm",
  opus: "audio/opus",
  aac: "audio/aac",
  m4a: "audio/m4a",
};

export class OpenAIVoiceProvider extends BaseVoiceProvider {
  readonly id = "openai" as const;
  readonly capabilities = {
    tts: true,
    stt: true,
    translate: false,
    dub: false,
    clone: false,
  };

  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey =
      (process.env.OPENAI_VOICE_API_KEY as string | undefined) ??
      (process.env.OPENAI_API_KEY as string | undefined);
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY (or OPENAI_VOICE_API_KEY) is not set.",
      );
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      maxRetries: 2,
      timeout: 60_000,
    });
    return this.client;
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const model = req.model ?? DEFAULT_TTS_MODEL;
    const format: VoiceAudioFormat = req.format ?? "mp3";
    try {
      const client = this.getClient();
      const response = await client.audio.speech.create({
        model,
        input: req.text,
        voice: req.voiceId as string,
        response_format: format as "mp3" | "wav" | "flac" | "pcm" | "opus" | "aac",
        speed: req.settings?.speed,
      });
      const audio = await response.arrayBuffer();
      return {
        audio,
        mimeType: FORMAT_TO_MIME[format] ?? "audio/mpeg",
        format,
        raw: response,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "synthesize", model });
    }
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const model = req.model ?? DEFAULT_STT_MODEL;
    try {
      const client = this.getClient();
      // OpenAI's Whisper API takes a multipart/form-data upload.
      const file = new File([req.audio], "audio", { type: req.mimeType });
      // The SDK's union of streaming + non-streaming create params makes the
      // typing awkward when we conditionally add fields. Cast through
      // `unknown` and let the SDK validate at runtime.
      const params = {
        model,
        file,
        ...(req.language ? { language: req.language } : {}),
        ...(req.speakerLabels || req.wordTimestamps
          ? {
              response_format: "verbose_json",
              timestamp_granularities: [
                ...(req.wordTimestamps ? (["word"] as const) : []),
                ...(req.speakerLabels ? (["segment"] as const) : []),
              ],
            }
          : {}),
      } as unknown as OpenAI.Audio.Transcriptions.TranscriptionCreateParams;
      // The SDK supports a typed overload for verbose_json, but the union
      // makes the call signature narrow at runtime — we cast defensively.
      const response = (await client.audio.transcriptions.create(
        params as never,
      )) as OpenAI.Audio.Transcriptions.Transcription & {
        text: string;
        language?: string;
        segments?: Array<{
          id: number;
          start: number;
          end: number;
          text: string;
          speaker?: string;
          confidence?: number;
          words?: Array<{ word: string; start: number; end: number; probability?: number }>;
        }>;
      };

      const segments: TranscriptSegment[] | undefined = response.segments?.map(
        (s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          speaker: s.speaker,
          confidence: s.confidence,
          words: s.words?.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            confidence: w.probability,
          })),
        }),
      );

      return {
        text: response.text ?? "",
        language: response.language ?? req.language,
        segments,
        raw: response,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "transcribe", model });
    }
  }

  async listModels(): Promise<VoiceModelInfo[]> {
    return MODELS;
  }
}
