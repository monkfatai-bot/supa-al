/**
 * Supa AI — Azure voice provider (TTS + STT via Speech Service).
 *
 * Uses the REST endpoints of Azure Cognitive Services Speech. Two env
 * vars are required: `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-providers/azure
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

const DEFAULT_TTS_MODEL = "azure-tts";
const DEFAULT_STT_MODEL = "azure-stt";

const MODELS: VoiceModelInfo[] = [
  {
    id: "azure-tts",
    label: "Azure Neural TTS",
    provider: "azure",
    type: "tts",
    description: "Neural text-to-speech with 400+ voices across 140+ locales.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"],
    supportedVoices: [
      { id: "en-US-JennyNeural", label: "Jenny", language: "en-US", gender: "female" },
      { id: "en-US-GuyNeural", label: "Guy", language: "en-US", gender: "male" },
      { id: "en-GB-SoniaNeural", label: "Sonia", language: "en-GB", gender: "female" },
      { id: "es-ES-ElviraNeural", label: "Elvira", language: "es-ES", gender: "female" },
      { id: "fr-FR-DeniseNeural", label: "Denise", language: "fr-FR", gender: "female" },
      { id: "de-DE-KatjaNeural", label: "Katja", language: "de-DE", gender: "female" },
      { id: "ja-JP-NanamiNeural", label: "Nanami", language: "ja-JP", gender: "female" },
      { id: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao", language: "zh-CN", gender: "female" },
    ],
    costCentsPer1K: 1.6,
    streaming: true,
  },
  {
    id: "azure-stt",
    label: "Azure Speech STT",
    provider: "azure",
    type: "stt",
    description: "Real-time + batch speech-to-text.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"],
    supportedVoices: [],
    costCentsPer1K: 1,
    streaming: true,
  },
];

export class AzureVoiceProvider extends BaseVoiceProvider {
  readonly id = "azure" as const;
  readonly capabilities = {
    tts: true,
    stt: true,
    translate: false,
    dub: false,
    clone: false,
  };

  private get key(): string {
    const k = process.env.AZURE_SPEECH_KEY;
    if (!k) throw new Error("AZURE_SPEECH_KEY is not set.");
    return k;
  }

  private get region(): string {
    const r = process.env.AZURE_SPEECH_REGION;
    if (!r) throw new Error("AZURE_SPEECH_REGION is not set.");
    return r;
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
    const model = req.model ?? DEFAULT_TTS_MODEL;
    void model;
    try {
      const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
      const ssml = `<speak version='1.0' xml:lang='${req.language ?? "en-US"}'><voice name='${req.voiceId}'>${escapeXml(req.text)}</voice></speak>`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        },
        body: ssml,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Azure TTS failed (${res.status}): ${text}`);
      }
      const audio = await res.arrayBuffer();
      return {
        audio,
        mimeType: "audio/mpeg",
        format: "mp3",
        raw: { status: res.status },
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "synthesize", voiceId: req.voiceId });
    }
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const model = req.model ?? DEFAULT_STT_MODEL;
    void model;
    try {
      const lang = req.language ?? "en-US";
      const url = `https://${this.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(lang)}&format=detailed`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.key,
          "Content-Type": req.mimeType,
          Accept: "application/json",
        },
        body: req.audio,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Azure STT failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as {
        DisplayText?: string;
        Offset?: number;
        Duration?: number;
        NBest?: Array<{
          Display?: string;
          Confidence?: number;
          Lexical?: string;
        }>;
      };
      const text = json.DisplayText ?? json.NBest?.[0]?.Display ?? "";
      const confidence = json.NBest?.[0]?.Confidence ?? undefined;
      const segments: TranscriptSegment[] | undefined = json.Duration
        ? [
            {
              start: (json.Offset ?? 0) / 10_000_000,
              end: ((json.Offset ?? 0) + (json.Duration ?? 0)) / 10_000_000,
              text,
              confidence,
            },
          ]
        : undefined;
      return {
        text,
        language: lang,
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
