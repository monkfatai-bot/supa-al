/**
 * Supa AI — Google Veo video provider (Phase 5).
 *
 * Wraps the Veo 3 long-running-operation (LRO) endpoint exposed by
 * Google's Generative Language API. Predictions are created via
 * `POST /v1beta/models/{model}:predictLongRunning` and polled via
 * `GET /v1beta/{name}`.
 *
 * Server-only.
 *
 * @module @/lib/ai/video-providers/google
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

const PROVIDER: VideoProviderId = "google";

const MODELS: VideoModel[] = [
  {
    id: "veo-3",
    provider: PROVIDER,
    label: "Google Veo 3",
    description: "Google DeepMind Veo 3 — high-quality cinematic generation.",
    maxDuration: 8,
    supportedResolutions: ["720p", "1080p"],
    supportedTypes: ["text-to-video", "image-to-video"],
    defaultResolution: "1080p",
    defaultAspectRatio: "16:9",
    costCentsPerSecond: 15,
  },
];

interface VeoLroResponse {
  name: string;
  done?: boolean;
  error?: { message?: string } | null;
  response?: {
    generatedSamples?: { videos?: { uri?: string }[] }[];
  };
}

export class GoogleVideoProvider extends BaseVideoProvider {
  readonly id = PROVIDER;
  protected defaultModel = "veo-3";

  private get apiKey(): string {
    return this.requireApiKey(
      env.ai.video.google.apiKey,
      "GOOGLE_VIDEO_API_KEY",
    );
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerationResult> {
    const apiKey = this.apiKey;
    const model = this.resolveModel(req);
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      durationSeconds: req.duration ?? 5,
      aspectRatio: req.aspectRatio ?? "16:9",
    };
    if (req.type === "image-to-video" && req.sourceImageUrl) {
      body.image = { gcsUri: req.sourceImageUrl };
    }

    try {
      const data = await this.http<VeoLroResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      return {
        externalJobId: data.name,
        status: "processing",
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, type: req.type });
    }
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobPollResult> {
    const apiKey = this.apiKey;
    try {
      const data = await this.http<VeoLroResponse>(
        `https://generativelanguage.googleapis.com/v1beta/${encodeURIComponent(externalJobId)}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "GET",
        },
      );
      const video =
        data.response?.generatedSamples?.[0]?.videos?.[0]?.uri ?? null;
      return {
        externalJobId: data.name,
        status: data.done
          ? data.error
            ? "failed"
            : "completed"
          : "processing",
        resultUrl: video,
        error: data.error?.message ?? null,
        raw: data,
      };
    } catch (err) {
      throw this.normalizeError(err, { externalJobId });
    }
  }

  async listModels(): Promise<VideoModel[]> {
    return MODELS;
  }
}
