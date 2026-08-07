/**
 * Supa AI — Ideogram image provider.
 *
 * Uses the Ideogram REST API directly. Implements Ideogram v2 — best-in-class
 * for prompts that include text. Reads `IDEOGRAM_API_KEY` from `process.env`.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-providers/ideogram
 */
import "server-only";

import { BaseImageProvider } from "../image-base";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageModel,
  ImageProviderId,
} from "../image-types";

const DEFAULT_MODEL = "ideogram-v2";
const BASE_URL = "https://api.ideogram.ai/v1";

interface IdeogramResponse {
  created: string;
  data: Array<{
    url?: string;
    revised_prompt?: string;
  }>;
}

const MODELS: ImageModel[] = [
  {
    id: "ideogram-v2",
    provider: "ideogram",
    label: "Ideogram v2",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "Ideogram v2 — best-in-class typography.",
  },
];

export class IdeogramImageProvider extends BaseImageProvider {
  readonly id: ImageProviderId = "ideogram";
  protected defaultModel = DEFAULT_MODEL;

  private get apiKey(): string {
    return process.env.IDEOGRAM_API_KEY ?? "";
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const model = this.resolveModel(req);
    try {
      const body: Record<string, unknown> = {
        prompt: req.prompt,
        model,
        aspect_ratio: this.sizeToAspectRatio(req.size),
        magic_prompt_option: "AUTO",
      };
      if (req.style) {
        body.style_type = req.style;
      }
      if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
      if (typeof req.seed === "number") body.seed = req.seed;
      if (typeof req.n === "number") body.num_images = Math.max(1, Math.min(req.n, 4));

      const res = await this.fetchJson<IdeogramResponse>(
        `${BASE_URL}/generate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        { model, op: "generate" },
      );

      const first = res.data?.[0];
      if (!first?.url) {
        throw this.normalizeError(
          new Error("Ideogram returned no image URL."),
          { model, op: "generate" },
        );
      }
      return {
        model,
        provider: this.id,
        url: first.url,
        b64: null,
        mimeType: "image/png",
        seed: typeof req.seed === "number" ? req.seed : null,
        raw: res,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, op: "generate" });
    }
  }

  async listModels(): Promise<ImageModel[]> {
    return MODELS;
  }

  /** Map a `WIDTHxHEIGHT` size to Ideogram's aspect-ratio string. */
  private sizeToAspectRatio(size?: string): string {
    if (!size) return "ASPECT_1_1";
    const [w, h] = size.split("x").map((n) => Number(n));
    if (!w || !h) return "ASPECT_1_1";
    const ratio = w / h;
    if (Math.abs(ratio - 16 / 9) < 0.05) return "ASPECT_16_9";
    if (Math.abs(ratio - 9 / 16) < 0.05) return "ASPECT_9_16";
    if (Math.abs(ratio - 4 / 3) < 0.05) return "ASPECT_4_3";
    if (Math.abs(ratio - 3 / 4) < 0.05) return "ASPECT_3_4";
    if (Math.abs(ratio - 3 / 2) < 0.05) return "ASPECT_3_2";
    if (Math.abs(ratio - 2 / 3) < 0.05) return "ASPECT_2_3";
    if (Math.abs(ratio - 10 / 16) < 0.05) return "ASPECT_10_16";
    if (Math.abs(ratio - 16 / 10) < 0.05) return "ASPECT_16_10";
    return "ASPECT_1_1";
  }
}
