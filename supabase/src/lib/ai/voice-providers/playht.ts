/**
 * Supa AI — PlayHT voice provider (TTS + cloning + dubbing).
 *
 * Uses the public REST API. API key from `PLAYHT_API_KEY` and
 * user id from `PLAYHT_USER_ID`.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-providers/playht
 */
import "server-only";

import type {
  CloneRequest,
  CloneResult,
  DubRequest,
  DubResult,
  SynthesizeRequest,
  SynthesizeResult,
  VoiceModelInfo,
} from "../voice-types";
import { BaseVoiceProvider } from "../voice-base";

const API_BASE = "https://api.play.ht/api/v2";

const DEFAULT_MODEL = "Play-3";

const MODELS: VoiceModelInfo[] = [
  {
    id: "play-3",
    label: "PlayHT Play 3",
    provider: "playht",
    type: "tts",
    description: "Multilingual low-latency TTS with cloning support.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN", "hi-IN"],
    supportedVoices: [
      { id: "s3://voice-cloning/0:1", label: "Aria", language: "en-US", gender: "female" },
      { id: "s3://voice-cloning/1:1", label: "Atlas", language: "en-US", gender: "male" },
    ],
    streaming: true,
    cloneable: true,
    costCentsPer1K: 2,
  },
];

export class PlayHTVoiceProvider extends BaseVoiceProvider {
  readonly id = "playht" as const;
  readonly capabilities = {
    tts: true,
    stt: false,
    translate: false,
    dub: true,
    clone: true,
  };

  private get apiKey(): string {
    const k = process.env.PLAYHT_API_KEY;
    if (!k) throw new Error("PLAYHT_API_KEY is not set.");
    return k;
  }

  private get userId(): string {
    const u = process.env.PLAYHT_USER_ID;
    if (!u) throw new Error("PLAYHT_USER_ID is not set.");
    return u;
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const model = req.model ?? DEFAULT_MODEL;
    try {
      const url = `${API_BASE}/tts/stream`;
      const body: Record<string, unknown> = {
        text: req.text,
        voice: req.voiceId,
        voice_engine: model,
        output_format: req.format === "wav" ? "wav" : "mp3",
      };
      if (req.language) body.language = req.language;
      if (req.settings?.speed !== undefined) body.speed = req.settings.speed;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-USER-ID": this.userId,
          AUTHORIZATION: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PlayHT TTS failed (${res.status}): ${text}`);
      }
      const audio = await res.arrayBuffer();
      return {
        audio,
        mimeType: "audio/mpeg",
        format: "mp3",
        raw: { status: res.status },
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "synthesize", model, voiceId: req.voiceId });
    }
  }

  async clone(req: CloneRequest): Promise<CloneResult> {
    try {
      const form = new FormData();
      form.append("sample_file", new File([req.audio], "sample.mp3", { type: req.mimeType }));
      form.append("voice_name", req.name);
      const res = await fetch(`${API_BASE}/cloned-voices/instant`, {
        method: "POST",
        headers: {
          "X-USER-ID": this.userId,
          AUTHORIZATION: `Bearer ${this.apiKey}`,
        },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PlayHT clone failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as { id?: string };
      return {
        voiceId: json.id ?? "",
        ready: true,
        raw: json,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "clone" });
    }
  }

  async dub(req: DubRequest): Promise<DubResult> {
    try {
      const form = new FormData();
      form.append("media_file", new File([req.audio], "source.mp3", { type: req.mimeType }));
      form.append("target_language", req.targetLanguage);
      if (req.sourceLanguage) form.append("source_language", req.sourceLanguage);
      if (req.voiceId) form.append("voice", req.voiceId);

      const res = await fetch(`${API_BASE}/dubs`, {
        method: "POST",
        headers: {
          "X-USER-ID": this.userId,
          AUTHORIZATION: `Bearer ${this.apiKey}`,
        },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PlayHT dub failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as { dub_id?: string; dub_url?: string };
      return {
        url: json.dub_url ?? "",
        externalJobId: json.dub_id,
        raw: json,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "dub" });
    }
  }

  async listModels(): Promise<VoiceModelInfo[]> {
    return MODELS;
  }
}
