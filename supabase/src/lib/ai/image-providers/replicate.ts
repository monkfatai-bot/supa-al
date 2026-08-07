/**
 * Supa AI — Replicate image provider.
 *
 * Uses the Replicate HTTP API directly. Hosts FLUX.1 [dev] and
 * FLUX.1 [schnell] via the official `black-forest-labs/flux-*` model
 * identifiers. The provider issues a prediction and polls until the
 * prediction is `succeeded` or `failed`.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-providers/replicate
 */
import "server-only";

import { BaseImageProvider } from "../image-base";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageModel,
  ImageProviderId,
} from "../image-types";

const DEFAULT_MODEL = "flux-dev";
const BASE_URL = "https://api.replicate.com/v1";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
  urls: { get: string; cancel: string } | null;
}

const MODELS: ImageModel[] = [
  {
    id: "flux-dev",
    provider: "replicate",
    label: "FLUX.1 [dev]",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "Replicate-hosted FLUX.1 dev model.",
  },
  {
    id: "flux-schnell",
    provider: "replicate",
    label: "FLUX.1 [schnell]",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "Replicate-hosted FLUX.1 schnell (fast).",
  },
];

const MODEL_VERSIONS: Record<string, string> = {
  "flux-dev":
    "black-forest-labs/flux-dev",
  "flux-schnell":
    "black-forest-labs/flux-schnell",
};

export class ReplicateImageProvider extends BaseImageProvider {
  readonly id: ImageProviderId = "replicate";
  protected defaultModel = DEFAULT_MODEL;

  private get apiToken(): string {
    return process.env.REPLICATE_API_TOKEN ?? "";
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const model = this.resolveModel(req);
    const modelSlug = MODEL_VERSIONS[model] ?? MODEL_VERSIONS[DEFAULT_MODEL];
    try {
      const createRes = await this.fetchJson<ReplicatePrediction>(
        `${BASE_URL}/models/${modelSlug}/predictions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            Prefer: "wait", // request a synchronous-ish response when possible
          },
          body: JSON.stringify({
            input: {
              prompt: req.prompt,
              ...(req.negativePrompt
                ? { negative_prompt: req.negativePrompt }
                : {}),
              ...(req.size
                ? {
                    width: Number(req.size.split("x")[0] ?? 1024),
                    height: Number(req.size.split("x")[1] ?? 1024),
                  }
                : {}),
              ...(typeof req.seed === "number" ? { seed: req.seed } : {}),
              num_outputs: Math.max(1, Math.min(req.n ?? 1, 1)),
            },
          }),
        },
        { model, op: "create-prediction" },
      );

      // If Prefer: wait returned a finished prediction, we can skip polling.
      let prediction = createRes;
      if (
        prediction.status !== "succeeded" &&
        prediction.status !== "failed"
      ) {
        const getUrl = createRes.urls?.get;
        if (!getUrl) {
          throw this.normalizeError(
            new Error("Replicate returned no polling URL."),
            { model, op: "poll" },
          );
        }
        prediction = await this.pollPrediction(getUrl, model);
      }

      if (prediction.status === "failed" || prediction.status === "canceled") {
        throw this.normalizeError(
          new Error(prediction.error ?? "Replicate prediction failed."),
          { model, op: "generate" },
        );
      }

      const output = prediction.output;
      const url = Array.isArray(output) ? output[0] ?? null : output;
      if (!url) {
        throw this.normalizeError(
          new Error("Replicate prediction succeeded but no output URL was returned."),
          { model, op: "generate" },
        );
      }
      return {
        model,
        provider: this.id,
        url,
        b64: null,
        mimeType: "image/png",
        seed: typeof req.seed === "number" ? req.seed : null,
        raw: prediction,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, op: "generate" });
    }
  }

  async listModels(): Promise<ImageModel[]> {
    return MODELS;
  }

  /** Poll the prediction URL until terminal status, with a timeout. */
  private async pollPrediction(
    url: string,
    model: string,
  ): Promise<ReplicatePrediction> {
    const deadline = Date.now() + 5 * 60 * 1000; // 5 minutes
    const intervalMs = 1500;
    let last: ReplicatePrediction | null = null;
    while (Date.now() < deadline) {
      last = await this.fetchJson<ReplicatePrediction>(
        url,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${this.apiToken}` },
        },
        { model, op: "poll" },
      );
      if (
        last.status === "succeeded" ||
        last.status === "failed" ||
        last.status === "canceled"
      ) {
        return last;
      }
      await sleep(intervalMs);
    }
    throw this.normalizeError(
      new Error("Replicate prediction timed out after 5 minutes."),
      { model, op: "poll", lastStatus: last?.status ?? "unknown" },
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
