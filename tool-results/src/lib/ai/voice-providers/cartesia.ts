/**
 * Supa AI — Cartesia voice provider (TTS only — ultra-low-latency).
 *
 * Uses the public REST API. API key from `CARTESIA_API_KEY`.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-providers/cartesia
 */
import "server-only";

import type {
  SynthesizeRequest,
  SynthesizeResult,
  VoiceModelInfo,
} from "../voice-types";
import { BaseVoiceProvider } from "../voice-base";

const API_BASE = "https://api.cartesia.ai";

const DEFAULT_MODEL = "sonic-2";

const MODELS: VoiceModelInfo[] = [
  {
    id: "sonic-2",
    label: "Cartesia Sonic-2",
    provider: "cartesia",
    type: "tts",
    description: "Ultra-low-latency multilingual TTS.",
    supportedLanguages: ["en-US", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"],
    supportedVoices: [
      { id: "7e1a2b2e-5d8a-4d8a-9d2a-7b1c2d3e4f5a", label: "Aria", language: "en-US", gender: "female" },
      { id: "2a1b3c4d-5e6f-4d8a-9d2a-7b1c2d3e4f5b", label: "Mateo", language: "en-US", gender: "male" },
      { id: "694f6d1a-2e5a-4d7a-bd2a-7b1c2d3e4f5c", label: "Sofia", language: "es-ES", gender: "female" },
    ],
    streaming: true,
    costCentsPer1K: 3,
    metadata: { latency_ms: 40 },
  },
];

const FORMAT_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  raw: "audio/pcm",
};

export class CartesiaVoiceProvider extends BaseVoiceProvider {
  readonly id = "cartesia" as const;
  readonly capabilities = {
    tts: true,
    stt: false,
    translate: false,
    dub: false,
    clone: false,
  };

  private get apiKey(): string {
    const k = process.env.CARTESIA_API_KEY;
    if (!k) throw new Error("CARTESIA_API_KEY is not set.");
    return k;
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const model = req.model ?? DEFAULT_MODEL;
    try {
      const format = req.format ?? "mp3";
      const url = `${API_BASE}/tts/bytes`;
      const body = {
        model_id: model,
        transcript: req.text,
        voice: { mode: "id", id: req.voiceId },
        output_format: `audio_${format}_44100`,
        language: req.language ?? "en",
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Cartesia TTS failed (${res.status}): ${text}`);
      }
      const audio = await res.arrayBuffer();
      return {
        audio,
        mimeType: FORMAT_TO_MIME[format] ?? "audio/mpeg",
        format,
        raw: { status: res.status },
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "synthesize", model, voiceId: req.voiceId });
    }
  }

  async listModels(): Promise<VoiceModelInfo[]> {
    return MODELS;
  }
}
