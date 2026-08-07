/**
 * Supa AI — Kling video provider (Phase 5).
 *
 * Wraps Kuaishou's Kling REST API. Kling accepts `text-to-video` and
 * `image-to-video` jobs via `POST /v1/videos/text2video` and
 * `POST /v1/videos/image2video`; status is polled via
 * `GET /v1/videos/{id}`.
 *
 * Server-only.
 *
 * @module @/lib/ai/video-providers/kling
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

const PROVIDER: VideoProviderId = "kling";

const MODELS: VideoModel[] = [
  {
    id: "kling-v1",
    provider: PROVIDER,
    label: "Kling v1",
    description: "Kuaishou Kling v1 — long-form text-to-video.",
    maxDuration: 12,
    supportedResolutions: ["720p", "1080p"],
    supportedTypes: ["text-to-video", "image-to-video"],
    defaultResolution: "1080p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 7,
  },
];

interface KlingTaskResponse {
  code: number;
  message?: string;
  data?: {
    task_id: string;
    task_status?: string;
    task_result?: {
      videos?: { url?: string; duration?: string }[];
    };
    task_status_msg?: string;
  };
}

export class KlingVideoProvider extends BaseVideoProvider {
  readonly id = PROVIDER;
  protected defaultModel = "kling-v1";

  private get apiKey(): string {
    return this.requireApiKey(env.ai.video.kling.apiKey, "KLING_API_KEY");
  }

  private get baseUrl(): string {
    return env.ai.video.kling.baseUrl;
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerationResult> {
    const apiKey = this.apiKey;
    const endpoint =
      req.type === "image-to-video" ? "image2video" : "text2video";
    const body: Record<string, unknown> = {
      model: this.resolveModel(req),
      prompt: req.prompt,
      duration: req.duration ?? 5,
      aspect_ratio: req.aspectRatio ?? "16:9",
    };
    if (req.type === "image-to-video" && req.sourceImageUrl) {
      body.image = req.sourceImageUrl;
    }

    try {
      const data = await this.http<KlingTaskResponse>(
        `${this.baseUrl}/videos/${endpoint}`,
        {
          method: "POST",
          authHeader: `Bearer ${apiKey}`,
          body: JSON.stringify(body),
        },
      );
      if (!data.data?.task_id) {
        throw this.normalizeError(new Error("Kling returned no task_id"), {
          endpoint,
        });
      }
      return {
        externalJobId: data.data.task_id,
        status: this.mapStatus(data.data.task_status),
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { endpoint, type: req.type });
    }
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobPollResult> {
    const apiKey = this.apiKey;
    try {
      const data = await this.http<KlingTaskResponse>(
        `${this.baseUrl}/videos/${encodeURIComponent(externalJobId)}`,
        {
          method: "GET",
          authHeader: `Bearer ${apiKey}`,
        },
      );
      const video = data.data?.task_result?.videos?.[0];
      return {
        externalJobId,
        status: this.mapStatus(data.data?.task_status),
        resultUrl: video?.url ?? null,
        error: data.data?.task_status_msg ?? null,
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
      case "succeed":
        return "completed";
      case "failed":
        return "failed";
      case "processing":
      case "submitted":
        return "processing";
      default:
        return "processing";
    }
  }
}
