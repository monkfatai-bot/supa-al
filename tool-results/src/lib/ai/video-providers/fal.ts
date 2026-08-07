/**
 * Supa AI — fal.ai video provider (Phase 5).
 *
 * Wraps the fal.ai queue API. fal accepts `POST {baseUrl}/{model}/` to
 * enqueue a generation; status is polled via
 * `GET {baseUrl}/{model}/status/{id}` and the result is fetched via
 * `GET {baseUrl}/{model}/requests/{id}`.
 *
 * Server-only.
 *
 * @module @/lib/ai/video-providers/fal
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

const PROVIDER: VideoProviderId = "fal";

const MODELS: VideoModel[] = [
  {
    id: "minimax-video",
    provider: PROVIDER,
    label: "Fal MiniMax Video",
    description: "MiniMax video model served via fal.ai.",
    maxDuration: 6,
    supportedResolutions: ["720p", "1080p"],
    supportedTypes: ["text-to-video", "image-to-video"],
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 8,
  },
];

interface FalQueueResponse {
  request_id: string;
  status?: string;
  video?: { url?: string } | null;
  error?: string | null;
}

export class FalVideoProvider extends BaseVideoProvider {
  readonly id = PROVIDER;
  protected defaultModel = "minimax-video";

  private get apiKey(): string {
    return this.requireApiKey(env.ai.video.fal.apiKey, "FAL_API_KEY");
  }

  private get baseUrl(): string {
    return env.ai.video.fal.baseUrl;
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerationResult> {
    const apiKey = this.apiKey;
    const model = this.resolveModel(req);
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      duration: req.duration ?? 5,
    };
    if (req.aspectRatio) body.aspect_ratio = req.aspectRatio;
    if (req.type === "image-to-video" && req.sourceImageUrl) {
      body.image_url = req.sourceImageUrl;
    }

    try {
      const data = await this.http<FalQueueResponse>(
        `${this.baseUrl}/${model}`,
        {
          method: "POST",
          authHeader: `Key ${apiKey}`,
          body: JSON.stringify(body),
        },
      );
      return {
        externalJobId: data.request_id,
        status: this.mapStatus(data.status),
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, type: req.type });
    }
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobPollResult> {
    const apiKey = this.apiKey;
    const model = this.defaultModel;
    try {
      const data = await this.http<FalQueueResponse>(
        `${this.baseUrl}/${model}/requests/${encodeURIComponent(externalJobId)}`,
        {
          method: "GET",
          authHeader: `Key ${apiKey}`,
        },
      );
      return {
        externalJobId: data.request_id,
        status: this.mapStatus(data.status),
        resultUrl: data.video?.url ?? null,
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
      case "COMPLETED":
        return "completed";
      case "FAILED":
        return "failed";
      case "IN_PROGRESS":
      case "IN_QUEUE":
        return "processing";
      default:
        return "processing";
    }
  }
}
