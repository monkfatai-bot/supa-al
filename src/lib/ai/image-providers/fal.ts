/**
 * Supa AI — Fal.ai image provider.
 *
 * Uses the Fal.ai REST queue API directly. Hosts FLUX.1 [dev] and SDXL
 * via optimized Fal endpoints. Reads `FAL_KEY` from `process.env`.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-providers/fal
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
const BASE_URL = "https://queue.fal.run";

interface FalQueueResponse {
  request_id: string;
  status_url: string;
  response_url: string;
  cancel_url: string;
  logs: unknown[] | null;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  logs: unknown[] | null;
  error?: string;
}

interface FalResultResponse {
  images?: Array<{ url: string; content_type?: string; width?: number; height?: number }>;
  image?: { url: string; content_type?: string };
  seed?: number;
  timings?: unknown;
}

const MODELS: ImageModel[] = [
  {
    id: "flux-dev",
    provider: "fal",
    label: "FLUX.1 [dev] (fal)",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "Fal.ai-hosted FLUX.1 dev — optimized latency.",
  },
  {
    id: "sdxl",
    provider: "fal",
    label: "SDXL (fal)",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "Fal.ai-hosted Stable Diffusion XL.",
  },
];

const FAL_ENDPOINTS: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev",
  sdxl: "fal-ai/fast-sdxl",
};

export class FalImageProvider extends BaseImageProvider {
  readonly id: ImageProviderId = "fal";
  protected defaultModel = DEFAULT_MODEL;

  private get authHeader(): string {
    const key = process.env.FAL_KEY ?? "";
    // Fal accepts `Key_Id:Key_Secret` for the user-facing key. When the
    // caller only sets one token, we send it as-is.
    return `Key ${key}`;
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const model = this.resolveModel(req);
    const endpoint = FAL_ENDPOINTS[model] ?? FAL_ENDPOINTS[DEFAULT_MODEL];
    try {
      const submitBody: Record<string, unknown> = {
        prompt: req.prompt,
        num_images: Math.max(1, Math.min(req.n ?? 1, 1)),
      };
      if (req.negativePrompt) submitBody.negative_prompt = req.negativePrompt;
      if (req.size) {
        const [w, h] = req.size.split("x").map((n) => Number(n));
        if (w) submitBody.image_size = { width: w, height: h ?? w };
      }
      if (typeof req.seed === "number") submitBody.seed = req.seed;
      if (req.style) submitBody.style = req.style;

      const submitRes = await this.fetchJson<FalQueueResponse>(
        `${BASE_URL}/${endpoint}/requests`,
        {
          method: "POST",
          headers: {
            Authorization: this.authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(submitBody),
        },
        { model, op: "submit" },
      );

      // Poll status until terminal.
      const status = await this.pollStatus(submitRes.status_url, model);
      if (status.status === "FAILED") {
        throw this.normalizeError(
          new Error(status.error ?? "Fal.ai prediction failed."),
          { model, op: "generate" },
        );
      }

      // Fetch the result.
      const result = await this.fetchJson<FalResultResponse>(
        submitRes.response_url,
        {
          method: "GET",
          headers: { Authorization: this.authHeader },
        },
        { model, op: "fetch-result" },
      );

      const firstImage =
        result.images?.[0] ?? result.image ?? null;
      if (!firstImage?.url) {
        throw this.normalizeError(
          new Error("Fal.ai returned no image URL."),
          { model, op: "generate" },
        );
      }
      return {
        model,
        provider: this.id,
        url: firstImage.url,
        b64: null,
        mimeType: firstImage.content_type ?? "image/png",
        seed: typeof result.seed === "number" ? result.seed : (typeof req.seed === "number" ? req.seed : null),
        raw: result,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, op: "generate" });
    }
  }

  async listModels(): Promise<ImageModel[]> {
    return MODELS;
  }

  /** Poll the Fal status URL until terminal. */
  private async pollStatus(
    url: string,
    model: string,
  ): Promise<FalStatusResponse> {
    const deadline = Date.now() + 5 * 60 * 1000;
    const intervalMs = 1500;
    let last: FalStatusResponse | null = null;
    while (Date.now() < deadline) {
      last = await this.fetchJson<FalStatusResponse>(
        url,
        {
          method: "GET",
          headers: { Authorization: this.authHeader },
        },
        { model, op: "poll" },
      );
      if (
        last.status === "COMPLETED" ||
        last.status === "FAILED"
      ) {
        return last;
      }
      await sleep(intervalMs);
    }
    throw this.normalizeError(
      new Error("Fal.ai prediction timed out after 5 minutes."),
      { model, op: "poll", lastStatus: last?.status ?? "unknown" },
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
