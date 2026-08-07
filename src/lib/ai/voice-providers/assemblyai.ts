/**
 * Supa AI — AssemblyAI voice provider (STT only).
 *
 * Uses the public REST API. API key from `ASSEMBLYAI_API_KEY`.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-providers/assemblyai
 */
import "server-only";

import type {
  TranscribeRequest,
  TranscribeResult,
  TranscriptSegment,
  VoiceModelInfo,
} from "../voice-types";
import { BaseVoiceProvider } from "../voice-base";

const API_BASE = "https://api.assemblyai.com/v2";

const DEFAULT_MODEL = "best";

/** Shape of the AssemblyAI transcript poll response. */
interface AssemblyAiTranscriptResult {
  status?: string;
  text?: string;
  language_code?: string;
  confidence?: number;
  utterances?: Array<{
    start?: number;
    end?: number;
    text?: string;
    speaker?: string;
    confidence?: number;
  }>;
  words?: Array<{ word?: string; start?: number; end?: number; confidence?: number }>;
  error?: string;
}

const MODELS: VoiceModelInfo[] = [
  {
    id: "best",
    label: "AssemblyAI Best",
    provider: "assemblyai",
    type: "stt",
    description: "Highest-accuracy general-purpose transcription model.",
    supportedLanguages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"],
    supportedVoices: [],
    costCentsPer1K: 3.7,
    metadata: { speaker_labels: true, sentiment_analysis: true },
  },
  {
    id: "nano",
    label: "AssemblyAI Nano",
    provider: "assemblyai",
    type: "stt",
    description: "Fast + low-cost model for high-volume workloads.",
    supportedLanguages: ["en-US"],
    supportedVoices: [],
    costCentsPer1K: 1.5,
  },
];

export class AssemblyAIVoiceProvider extends BaseVoiceProvider {
  readonly id = "assemblyai" as const;
  readonly capabilities = {
    tts: false,
    stt: true,
    translate: false,
    dub: false,
    clone: false,
  };

  private get apiKey(): string {
    const k = process.env.ASSEMBLYAI_API_KEY;
    if (!k) throw new Error("ASSEMBLYAI_API_KEY is not set.");
    return k;
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const model = req.model ?? DEFAULT_MODEL;
    try {
      // Upload the audio via the /upload endpoint.
      const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/octet-stream",
        },
        body: req.audio,
      });
      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`AssemblyAI upload failed (${uploadRes.status}): ${text}`);
      }
      const uploadJson = (await uploadRes.json()) as { upload_url?: string };

      // Submit the transcription request.
      const submitRes = await fetch(`${API_BASE}/transcript`, {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio_url: uploadJson.upload_url,
          speech_model: model === "nano" ? "nano" : undefined,
          language_code: req.language ?? "en_us",
          speaker_labels: req.speakerLabels ?? false,
          sentiment_analysis: false,
        }),
      });
      if (!submitRes.ok) {
        const text = await submitRes.text();
        throw new Error(`AssemblyAI submit failed (${submitRes.status}): ${text}`);
      }
      const submitJson = (await submitRes.json()) as { id?: string };

      // Poll for completion. AssemblyAI is async — we cap at 60 seconds.
      const transcriptId = submitJson.id;
      if (!transcriptId) {
        throw new Error("AssemblyAI did not return a transcript id.");
      }
      const deadline = Date.now() + 60_000;
      let status: string = "queued";
      let result: AssemblyAiTranscriptResult | null = null;

      while (Date.now() < deadline && status !== "completed" && status !== "error") {
        await sleep(2_000);
        const pollRes = await fetch(`${API_BASE}/transcript/${transcriptId}`, {
          method: "GET",
          headers: { Authorization: this.apiKey },
        });
        if (!pollRes.ok) {
          const text = await pollRes.text();
          throw new Error(`AssemblyAI poll failed (${pollRes.status}): ${text}`);
        }
        const pollJson = (await pollRes.json()) as AssemblyAiTranscriptResult;
        status = pollJson.status ?? "queued";
        if (status === "completed" || status === "error") {
          result = pollJson;
        }
      }
      if (status === "error") {
        throw new Error(`AssemblyAI transcription error: ${result?.error ?? "unknown"}`);
      }
      if (!result) {
        throw new Error("AssemblyAI transcription timed out after 60s.");
      }

      const text = result.text ?? "";
      const confidence = result.confidence ?? undefined;
      const segments: TranscriptSegment[] | undefined = result.utterances?.length
        ? result.utterances.map((u) => ({
            start: u.start ?? 0,
            end: u.end ?? 0,
            text: u.text ?? "",
            speaker: u.speaker,
            confidence: u.confidence,
          }))
        : result.words?.length
          ? [
              {
                start: result.words[0]?.start ?? 0,
                end: result.words[result.words.length - 1]?.end ?? 0,
                text,
                confidence,
                words: result.words.map((w) => ({
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
        language: result.language_code ?? req.language,
        confidence,
        segments,
        raw: result,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "transcribe", model });
    }
  }

  async listModels(): Promise<VoiceModelInfo[]> {
    return MODELS;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
