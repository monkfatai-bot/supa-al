/**
 * Supa AI — Stability AI image provider.
 *
 * Direct REST integration against `https://api.stability.ai/v1/generation/...`.
 * Uses `STABILITY_API_KEY` from `process.env`. Implements Stable Diffusion 3
 * and Stable Diffusion XL.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-providers/stability
 */
import "server-only";

import { BaseImageProvider } from "../image-base";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageModel,
  ImageProviderId,
} from "../image-types";

const DEFAULT_MODEL = "stable-diffusion-3";
const BASE_URL =
  process.env.STABILITY_BASE_URL ?? "https://api.stability.ai/v1";

const MODELS: ImageModel[] = [
  {
    id: "stable-diffusion-3",
    provider: "stability",
    label: "Stable Diffusion 3",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "Stability AI SD3 — strong prompt adherence.",
  },
  {
    id: "stable-diffusion-xl",
    provider: "stability",
    label: "Stable Diffusion XL",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "Stability AI SDXL — versatile open model.",
  },
];

export class StabilityImageProvider extends BaseImageProvider {
  readonly id: ImageProviderId = "stability";
  protected defaultModel = DEFAULT_MODEL;

  private get apiKey(): string {
    return process.env.STABILITY_API_KEY ?? "";
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const model = this.resolveModel(req);
    try {
      const endpoint = this.endpointFor(model);
      const init: RequestInit = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "image/*",
        },
      };

      // Stability's SD3 endpoint accepts JSON; SDXL uses multipart form.
      if (model.startsWith("stable-diffusion-3")) {
        init.headers = {
          ...(init.headers as Record<string, string>),
          "Content-Type": "application/json",
        };
        const body: Record<string, unknown> = {
          prompt: req.prompt,
          mode: "text-to-image",
          output_format: "png",
        };
        if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
        if (req.size) {
          const [w, h] = req.size.split("x").map((n) => Number(n));
          if (w && h) {
            body.width = w;
            body.height = h;
          }
        }
        if (typeof req.seed === "number") body.seed = req.seed;
        if (typeof req.n === "number") body.n = Math.max(1, Math.min(req.n, 1));
        init.body = JSON.stringify(body);
      } else {
        // SDXL multipart form.
        const form = new FormData();
        form.append("text_prompt", JSON.stringify({
          text: req.prompt,
          ...(req.negativePrompt ? { negative: req.negativePrompt } : {}),
        }));
        if (req.size) {
          const [w, h] = req.size.split("x").map((n) => Number(n));
          if (w) form.append("width", String(w));
          if (h) form.append("height", String(h));
        }
        if (typeof req.seed === "number") form.append("seed", String(req.seed));
        form.append("output_format", "png");
        init.body = form;
      }

      const { b64, mimeType } = await this.fetchBuffer(
        `${BASE_URL}/generation/${endpoint}`,
        init,
        { model, op: "generate" },
      );
      return {
        model,
        provider: this.id,
        url: null,
        b64,
        mimeType,
        seed: typeof req.seed === "number" ? req.seed : null,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, op: "generate" });
    }
  }

  async listModels(): Promise<ImageModel[]> {
    return MODELS;
  }

  /** Resolve the model-specific endpoint slug on `api.stability.ai`. */
  private endpointFor(model: string): string {
    if (model.startsWith("stable-diffusion-3")) return "stable-image/core";
    if (model.includes("xl")) return "stable-image/ultra";
    return "stable-image/core";
  }
}
