/**
 * Supa AI — Pika video provider (Phase 5).
 *
 * Wraps Pika's REST API. Pika accepts text-to-video and image-to-video
 * via `POST /v1/generate`; status is polled via `GET /v1/generate/{id}`.
 *
 * Server-only.
 *
 * @module @/lib/ai/video-providers/pika
 */
import "server-only";

import { env } from "@/lib/config/env";

import { BaseVideoProvider } from "../video-base";
import type {
  VideoGenerateRequest,
  VideoGenerationResult,
  VideoJobPollResult,
  VideoModel,
  VideoProviderId,
  VideoStatus,
} from "../video-types";

const PROVIDER: VideoProviderId = "pika";

const MODELS: VideoModel[] = [
  {
    id: "pika-1.5",
    provider: PROVIDER,
    label: "Pika 1.5",
    description: "Pika 1.5 — playful, creative text-to-video.",
    maxDuration: 8,
    supportedResolutions: ["720p"],
    supportedTypes: ["text-to-video", "image-to-video"],
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 4,
  },
];

interface PikaGenerateResponse {
  id: string;
  status?: string;
  video_url?: string | null;
  error?: string | null;
  progress?: number;
}

export class PikaVideoProvider extends BaseVideoProvider {
  readonly id = PROVIDER;
  protected defaultModel = "pika-1.5";

  private get apiKey(): string {
    return this.requireApiKey(env.ai.video.pika.apiKey, "PIKA_API_KEY");
  }

  private get baseUrl(): string {
    return env.ai.video.pika.baseUrl;
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerationResult> {
    const apiKey = this.apiKey;
    const body: Record<string, unknown> = {
      model: this.resolveModel(req),
      prompt: req.prompt,
      duration: req.duration ?? 5,
      aspect_ratio: req.aspectRatio ?? "16:9",
    };
    if (req.type === "image-to-video" && req.sourceImageUrl) {
      body.image_url = req.sourceImageUrl;
    }

    try {
      const data = await this.http<PikaGenerateResponse>(
        `${this.baseUrl}/generate`,
        {
          method: "POST",
          authHeader: `Bearer ${apiKey}`,
          body: JSON.stringify(body),
        },
      );
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.status),
        progress: typeof data.progress === "number" ? data.progress : 0,
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { type: req.type });
    }
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobPollResult> {
    const apiKey = this.apiKey;
    try {
      const data = await this.http<PikaGenerateResponse>(
        `${this.baseUrl}/generate/${encodeURIComponent(externalJobId)}`,
        {
          method: "GET",
          authHeader: `Bearer ${apiKey}`,
        },
      );
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.status),
        progress: typeof data.progress === "number" ? data.progress : 100,
        resultUrl: data.video_url ?? null,
        error: data.error ?? null,
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { externalJobId });
    }
  }

  async listModels(): Promise<VideoModel[]> {
    return MODELS;
  }

  private mapStatus(s?: string): VideoStatus {
    switch (s) {
      case "completed":
      case "succeeded":
        return "completed";
      case "failed":
        return "failed";
      case "processing":
      case "queued":
      case "pending":
        return "processing";
      case "cancelled":
        return "cancelled";
      default:
        return "processing";
    }
  }
}
