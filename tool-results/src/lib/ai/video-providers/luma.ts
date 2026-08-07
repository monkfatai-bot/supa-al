/**
 * Supa AI — Luma Dream Machine video provider (Phase 5).
 *
 * Wraps Luma Labs' REST API. Luma exposes `POST /v1/generations` for
 * text-to-video and image-to-video; status is polled via
 * `GET /v1/generations/{id}`.
 *
 * Server-only.
 *
 * @module @/lib/ai/video-providers/luma
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

const PROVIDER: VideoProviderId = "luma";

const MODELS: VideoModel[] = [
  {
    id: "dream-machine",
    provider: PROVIDER,
    label: "Luma Dream Machine",
    description: "Luma Labs Dream Machine — high-fidelity motion.",
    maxDuration: 5,
    supportedResolutions: ["720p", "1080p"],
    supportedTypes: ["text-to-video", "image-to-video"],
    defaultResolution: "1080p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 12,
  },
];

interface LumaGenerationResponse {
  id: string;
  state?: string;
  video?: string | null;
  failure?: string | null;
}

export class LumaVideoProvider extends BaseVideoProvider {
  readonly id = PROVIDER;
  protected defaultModel = "dream-machine";

  private get apiKey(): string {
    return this.requireApiKey(env.ai.video.luma.apiKey, "LUMA_API_KEY");
  }

  private get baseUrl(): string {
    return env.ai.video.luma.baseUrl;
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerationResult> {
    const apiKey = this.apiKey;
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      model: this.resolveModel(req),
      duration: req.duration ?? 5,
      aspect_ratio: req.aspectRatio ?? "16:9",
    };
    if (req.type === "image-to-video" && req.sourceImageUrl) {
      body.keyframes = { frame0: { type: "image", url: req.sourceImageUrl } };
    }

    try {
      const data = await this.http<LumaGenerationResponse>(
        `${this.baseUrl}/generations`,
        {
          method: "POST",
          authHeader: `Bearer ${apiKey}`,
          body: JSON.stringify(body),
        },
      );
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.state),
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { type: req.type });
    }
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobPollResult> {
    const apiKey = this.apiKey;
    try {
      const data = await this.http<LumaGenerationResponse>(
        `${this.baseUrl}/generations/${encodeURIComponent(externalJobId)}`,
        {
          method: "GET",
          authHeader: `Bearer ${apiKey}`,
        },
      );
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.state),
        resultUrl: data.video ?? null,
        error: data.failure ?? null,
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
        return "completed";
      case "failed":
        return "failed";
      case "queued":
      case "dreaming":
        return "processing";
      default:
        return "processing";
    }
  }
}
