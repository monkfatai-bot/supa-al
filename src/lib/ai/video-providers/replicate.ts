/**
 * Supa AI — Replicate video provider (Phase 5).
 *
 * Wraps Replicate's REST API. Predictions are created via
 * `POST /v1/predictions` (passing the model + input) and polled via
 * `GET /v1/predictions/{id}`. The caller passes a fully-qualified
 * `owner/model:version` string as `req.model`.
 *
 * Server-only.
 *
 * @module @/lib/ai/video-providers/replicate
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

const PROVIDER: VideoProviderId = "replicate";

const DEFAULT_VERSION = "wan-ai/wan-2.1";

const MODELS: VideoModel[] = [
  {
    id: "wan-2.1",
    provider: PROVIDER,
    label: "Replicate Wan 2.1",
    description: "Wan 2.1 hosted on Replicate — open video model.",
    maxDuration: 6,
    supportedResolutions: ["720p", "1080p"],
    supportedTypes: ["text-to-video", "image-to-video"],
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 6,
  },
];

interface ReplicatePredictionResponse {
  id: string;
  status: string;
  output?: string | string[];
  error?: string | null;
  urls?: { get?: string };
}

export class ReplicateVideoProvider extends BaseVideoProvider {
  readonly id = PROVIDER;
  protected defaultModel = DEFAULT_VERSION;

  private get apiToken(): string {
    return this.requireApiKey(
      env.ai.video.replicate.apiToken,
      "REPLICATE_API_TOKEN",
    );
  }

  private get baseUrl(): string {
    return env.ai.video.replicate.baseUrl;
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerationResult> {
    const apiToken = this.apiToken;
    const modelVersion = this.resolveModel(req);
    const input: Record<string, unknown> = {
      prompt: req.prompt,
    };
    if (req.duration) input.num_frames = Math.round(req.duration * 24);
    if (req.aspectRatio) input.aspect_ratio = req.aspectRatio;
    if (req.type === "image-to-video" && req.sourceImageUrl) {
      input.image = req.sourceImageUrl;
    }
    const body = JSON.stringify({ version: modelVersion, input });

    try {
      const data = await this.http<ReplicatePredictionResponse>(
        `${this.baseUrl}/predictions`,
        {
          method: "POST",
          authHeader: `Bearer ${apiToken}`,
          body,
        },
      );
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.status),
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { type: req.type, modelVersion });
    }
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobPollResult> {
    const apiToken = this.apiToken;
    try {
      const data = await this.http<ReplicatePredictionResponse>(
        `${this.baseUrl}/predictions/${encodeURIComponent(externalJobId)}`,
        {
          method: "GET",
          authHeader: `Bearer ${apiToken}`,
        },
      );
      const out = Array.isArray(data.output)
        ? data.output[0] ?? null
        : data.output ?? null;
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.status),
        resultUrl: out,
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

  private mapStatus(s: string): VideoStatus {
    switch (s) {
      case "succeeded":
        return "completed";
      case "failed":
      case "canceled":
        return "failed";
      case "starting":
      case "processing":
        return "processing";
      default:
        return "processing";
    }
  }
}
