/**
 * Supa AI — OpenAI Sora video provider (Phase 5).
 *
 * Wraps OpenAI's `/v1/videos` API. Sora accepts `text-to-video`,
 * `image-to-video`, and `video-to-video` jobs; status is polled via
 * `GET /v1/videos/{id}`. Uses `OPENAI_VIDEO_API_KEY` (separate from the
 * chat key to allow per-feature key rotation).
 *
 * Server-only.
 *
 * @module @/lib/ai/video-providers/openai
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

const PROVIDER: VideoProviderId = "openai";

const MODELS: VideoModel[] = [
  {
    id: "sora-2",
    provider: PROVIDER,
    label: "OpenAI Sora 2",
    description: "OpenAI Sora 2 — long-form, high-resolution video.",
    maxDuration: 12,
    supportedResolutions: ["720p", "1080p", "4k"],
    supportedTypes: ["text-to-video", "image-to-video", "video-to-video"],
    defaultResolution: "1080p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 20,
  },
];

interface SoraVideoResponse {
  id: string;
  status: string;
  url?: string | null;
  error?: string | null;
  completion?: string | null;
}

export class OpenAIVideoProvider extends BaseVideoProvider {
  readonly id = PROVIDER;
  protected defaultModel = "sora-2";

  private get apiKey(): string {
    return this.requireApiKey(
      env.ai.video.openai.apiKey,
      "OPENAI_VIDEO_API_KEY",
    );
  }

  private get baseUrl(): string {
    return env.ai.providers.openai.baseUrl.replace(/\/v1\/?$/, "") + "/v1";
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerationResult> {
    const apiKey = this.apiKey;
    const body: Record<string, unknown> = {
      model: this.resolveModel(req),
      prompt: req.prompt,
      duration: req.duration ?? 5,
      size: this.sizeFromAspect(req.aspectRatio ?? "16:9"),
    };
    if (req.type === "image-to-video" && req.sourceImageUrl) {
      body.input = [req.sourceImageUrl];
    }
    if (req.type === "video-to-video" && req.sourceVideoUrl) {
      body.input = [req.sourceVideoUrl];
    }

    try {
      const data = await this.http<SoraVideoResponse>(
        `${this.baseUrl}/videos`,
        {
          method: "POST",
          authHeader: `Bearer ${apiKey}`,
          body: JSON.stringify(body),
        },
      );
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.status),
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { type: req.type });
    }
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobPollResult> {
    const apiKey = this.apiKey;
    try {
      const data = await this.http<SoraVideoResponse>(
        `${this.baseUrl}/videos/${encodeURIComponent(externalJobId)}`,
        {
          method: "GET",
          authHeader: `Bearer ${apiKey}`,
        },
      );
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.status),
        resultUrl: data.url ?? null,
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

  /** Map a friendly aspect ratio label to a Sora `size` token. */
  private sizeFromAspect(ratio: string): string {
    switch (ratio) {
      case "9:16":
        return "1080x1920";
      case "1:1":
        return "1080x1080";
      case "16:9":
      default:
        return "1920x1080";
    }
  }

  private mapStatus(s: string): VideoStatus {
    switch (s) {
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "cancelled":
        return "cancelled";
      case "queued":
      case "in_progress":
      case "processing":
      default:
        return "processing";
    }
  }
}
