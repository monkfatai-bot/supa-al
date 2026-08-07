/**
 * Supa AI — ElevenLabs voice provider (TTS + cloning).
 *
 * ElevenLabs focuses on high-quality TTS with instant voice cloning.
 * Uses the REST API directly (`fetch`) — we don't pull a dedicated SDK
 * for this provider, keeping the dependency footprint minimal.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-providers/elevenlabs
 */
import "server-only";

import type {
  CloneRequest,
  CloneResult,
  SynthesizeRequest,
  SynthesizeResult,
  VoiceModelInfo,
} from "../voice-types";
import { BaseVoiceProvider } from "../voice-base";

const API_BASE = "https://api.elevenlabs.io/v1";

const DEFAULT_MODEL = "eleven-multilingual-v2";

const MODELS: VoiceModelInfo[] = [
  {
    id: "eleven-multilingual-v2",
    label: "Eleven Multilingual v2",
    provider: "elevenlabs",
    type: "tts",
    description: "Multilingual TTS supporting 29 languages with high emotional range.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "it-IT", "ja-JP", "zh-CN"],
    supportedVoices: [
      { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", language: "en-US", gender: "female" },
      { id: "AZnzlk1XvdvUeBnXldC9", label: "Adam", language: "en-US", gender: "male" },
      { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella", language: "en-US", gender: "female" },
    ],
    streaming: true,
    cloneable: true,
    costCentsPer1K: 3,
    metadata: { supports_cloning: true, supports_streaming: true },
  },
  {
    id: "eleven-monolingual-v1",
    label: "Eleven Monolingual v1",
    provider: "elevenlabs",
    type: "tts",
    description: "English-only TTS optimized for low latency.",
    supportedLanguages: ["en-US", "en-GB"],
    supportedVoices: [
      { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", language: "en-US", gender: "female" },
      { id: "AZnzlk1XvdvUeBnXldC9", label: "Adam", language: "en-US", gender: "male" },
    ],
    streaming: true,
    costCentsPer1K: 1.5,
    metadata: { supports_cloning: false },
  },
];

const FORMAT_TO_MIME: Record<string, string> = {
  mp3_44100_128: "audio/mpeg",
  mp3_44100_192: "audio/mpeg",
  pcm_16000: "audio/pcm",
  pcm_22050: "audio/pcm",
  pcm_24000: "audio/pcm",
  pcm_44100: "audio/pcm",
  ulaw_8000: "audio/basic",
};

export class ElevenLabsVoiceProvider extends BaseVoiceProvider {
  readonly id = "elevenlabs" as const;
  readonly capabilities = {
    tts: true,
    stt: false,
    translate: false,
    dub: true,
    clone: true,
  };

  private get apiKey(): string {
    const k = process.env.ELEVENLABS_API_KEY;
    if (!k) throw new Error("ELEVENLABS_API_KEY is not set.");
    return k;
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const model = req.model ?? DEFAULT_MODEL;
    const format = req.settings?.extra?.output_format as string | undefined;
    try {
      const url = `${API_BASE}/text-to-speech/${encodeURIComponent(
        req.voiceId,
      )}`;
      const body: Record<string, unknown> = {
        text: req.text,
        model_id: model,
      };
      if (req.settings?.stability !== undefined) {
        body.voice_settings = {
          stability: req.settings.stability,
          similarity_boost: req.settings.similarityBoost ?? 0.5,
          style: req.settings.style ?? 0,
          use_speaker_boost: req.settings.speakerBoost ?? true,
        };
      }
      if (format) body.output_format = format;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw this.normalizeError(
          new Error(`ElevenLabs TTS failed (${res.status}): ${text}`),
          { op: "synthesize", model, voiceId: req.voiceId },
        );
      }
      const audio = await res.arrayBuffer();
      return {
        audio,
        mimeType: "audio/mpeg",
        format: "mp3",
        raw: { status: res.status },
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("ElevenLabs")) throw err;
      throw this.normalizeError(err, { op: "synthesize", model, voiceId: req.voiceId });
    }
  }

  async clone(req: CloneRequest): Promise<CloneResult> {
    try {
      const form = new FormData();
      form.append("name", req.name);
      if (req.description) form.append("description", req.description);
      const file = new File([req.audio], "sample.mp3", { type: req.mimeType });
      form.append("files", file);

      const res = await fetch(`${API_BASE}/voices/add`, {
        method: "POST",
        headers: { "xi-api-key": this.apiKey },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs clone failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as { voice_id?: string; requires_verification?: boolean };
      return {
        voiceId: json.voice_id ?? "",
        ready: !json.requires_verification,
        raw: json,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "clone" });
    }
  }

  async listModels(): Promise<VoiceModelInfo[]> {
    return MODELS;
  }
}

// Re-exported so callers can resolve a MIME from a provider output_format
// without re-declaring the table.
export function elevenLabsFormatMime(format: string): string {
  return FORMAT_TO_MIME[format] ?? "audio/mpeg";
}
