/**
 * Supa AI — Runway video provider (Phase 5).
 *
 * Wraps Runway's REST API for the `gen-3-alpha` and `gen-3-turbo` models.
 * Runway submits jobs asynchronously: the create endpoint returns a job
 * id, which is then polled via `GET /v1/generation_tasks/{id}`.
 *
 * Server-only: issues HTTP requests to an external API and reads the
 * provider's API key from the central env contract.
 *
 * @module @/lib/ai/video-providers/runway
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

const PROVIDER: VideoProviderId = "runway";

const MODELS: VideoModel[] = [
  {
    id: "gen-3-alpha",
    provider: PROVIDER,
    label: "Runway Gen-3 Alpha",
    description: "Cinematic text-to-video and image-to-video model from Runway.",
    maxDuration: 10,
    supportedResolutions: ["720p", "1080p"],
    supportedTypes: ["text-to-video", "image-to-video"],
    defaultResolution: "1080p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 10,
  },
  {
    id: "gen-3-turbo",
    provider: PROVIDER,
    label: "Runway Gen-3 Turbo",
    description: "Faster, lighter-weight Runway model for quick iterations.",
    maxDuration: 10,
    supportedResolutions: ["720p"],
    supportedTypes: ["text-to-video", "image-to-video"],
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 5,
  },
];

interface RunwayTaskResponse {
  id: string;
  status: string;
  output?: string | string[];
  failure?: string;
  failure_code?: string;
  progress?: number;
}

export class RunwayVideoProvider extends BaseVideoProvider {
  readonly id = PROVIDER;
  protected defaultModel = "gen-3-alpha";

  private get apiKey(): string {
    return this.requireApiKey(env.ai.video.runway.apiKey, "RUNWAY_API_KEY");
  }

  private get baseUrl(): string {
    return env.ai.video.runway.baseUrl;
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerationResult> {
    const apiKey = this.apiKey;
    const model = this.resolveModel(req);
    const body: Record<string, unknown> = {
      model,
      promptText: req.prompt,
      duration: req.duration ?? 5,
      ratio: req.aspectRatio ?? "16:9",
    };
    if (req.type === "image-to-video" && req.sourceImageUrl) {
      body.promptImage = req.sourceImageUrl;
    }
    if (req.resolution) body.resolution = req.resolution;

    try {
      const data = await this.http<RunwayTaskResponse>(
        `${this.baseUrl}/generation_tasks`,
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
      throw this.normalizeError(err, { model, type: req.type });
    }
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobPollResult> {
    const apiKey = this.apiKey;
    try {
      const data = await this.http<RunwayTaskResponse>(
        `${this.baseUrl}/generation_tasks/${encodeURIComponent(externalJobId)}`,
        {
          method: "GET",
          authHeader: `Bearer ${apiKey}`,
        },
      );
      const out = Array.isArray(data.output)
        ? data.output[0] ?? null
        : data.output ?? null;
      return {
        externalJobId: data.id,
        status: this.mapStatus(data.status),
        progress: typeof data.progress === "number" ? data.progress : 100,
        resultUrl: out,
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

  private mapStatus(s: string): VideoStatus {
    switch (s) {
      case "SUCCEEDED":
        return "completed";
      case "FAILED":
        return "failed";
      case "RUNNING":
      case "PENDING":
      case "THROTTLED":
        return "processing";
      case "CANCELLED":
        return "cancelled";
      default:
        return "processing";
    }
  }
}
