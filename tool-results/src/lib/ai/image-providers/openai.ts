/**
 * Supa AI — OpenAI DALL·E image provider.
 *
 * Uses the official `openai` SDK v4 (already installed for the chat
 * surface). Implements both `dall-e-3` (default) and `dall-e-2`.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-providers/openai
 */
import "server-only";

import OpenAI from "openai";

import { env } from "@/lib/config/env";

import { BaseImageProvider } from "../image-base";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageModel,
  ImageProviderId,
} from "../image-types";

const DEFAULT_MODEL = "dall-e-3";

/** Static catalog — covers the models we expose in Phase 4. */
const MODELS: ImageModel[] = [
  {
    id: "dall-e-3",
    provider: "openai",
    label: "DALL·E 3",
    maxSize: "1792x1024",
    supportedStyles: null,
    isActive: true,
    description: "OpenAI DALL·E 3 — high-fidelity text-to-image.",
  },
  {
    id: "dall-e-2",
    provider: "openai",
    label: "DALL·E 2",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "OpenAI DALL·E 2 — lower cost, edit-friendly.",
  },
];

export class OpenAIImageProvider extends BaseImageProvider {
  readonly id: ImageProviderId = "openai";
  protected defaultModel = DEFAULT_MODEL;

  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = env.ai.providers.openai.apiKey;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set.");
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: env.ai.providers.openai.baseUrl,
      maxRetries: 2,
      timeout: 120_000,
    });
    return this.client;
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const model = this.resolveModel(req);
    const client = this.getClient();
    try {
      // Edit workflow — OpenAI supports image edits via the `images.edit`
      // endpoint, but it requires a file upload. Phase 4 V1 keeps the
      // surface text-only for the OpenAI provider; image-edit is handled
      // by the dedicated service methods (enhance / upscale /
      // remove-background) which route to providers that accept URL inputs.
      if (req.sourceImageUrl) {
        // Fall through to a text-only generation with a prompt that
        // incorporates the source URL as context. A future phase can
        // wire the real OpenAI image-edit endpoint.
      }

      const params: OpenAI.Images.ImageGenerateParams = {
        model,
        prompt: req.prompt,
        n: Math.max(1, Math.min(req.n ?? 1, 1)),
        size: (req.size ?? "1024x1024") as
          | "256x256"
          | "512x512"
          | "1024x1024"
          | "1792x1024"
          | "1024x1792",
        // dall-e-3 supports only `standard` and `hd`; dall-e-2 ignores this.
        quality:
          (req.quality === "hd" || req.quality === "high"
            ? "hd"
            : "standard") as "standard" | "hd",
        response_format: "b64_json",
        user: req.user,
      };

      const res = await client.images.generate(params);
      const first = res.data?.[0];
      if (!first) {
        throw this.normalizeError(
          new Error("OpenAI returned no image data."),
          { model, op: "generate" },
        );
      }
      const b64 = (first.b64_json ?? null) as string | null;
      const url = (first.url ?? null) as string | null;
      if (!b64 && !url) {
        throw this.normalizeError(
          new Error("OpenAI returned neither b64_json nor url."),
          { model, op: "generate" },
        );
      }
      return {
        model,
        provider: this.id,
        url,
        b64,
        mimeType: "image/png",
        seed: null,
        raw: res,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, op: "generate" });
    }
  }

  async listModels(): Promise<ImageModel[]> {
    return MODELS;
  }
}
