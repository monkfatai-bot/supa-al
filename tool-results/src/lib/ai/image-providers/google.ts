/**
 * Supa AI — Google Imagen image provider.
 *
 * Uses the Google Generative AI SDK (already installed for the chat
 * surface) — the `@google/generative-ai` package exposes the
 * `generateImage` / `Imagen` family of models.
 *
 * Reads `GOOGLE_GENERATIVE_AI_API_KEY` from `process.env` (reusing the
 * chat provider's env var since Google issues one key per project).
 *
 * Server-only.
 *
 * @module @/lib/ai/image-providers/google
 */
import "server-only";

import {
  GoogleGenerativeAI,
} from "@google/generative-ai";

import { BaseImageProvider } from "../image-base";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageModel,
  ImageProviderId,
} from "../image-types";

const DEFAULT_MODEL = "imagen-3";

const MODELS: ImageModel[] = [
  {
    id: "imagen-3",
    provider: "google",
    label: "Imagen 3",
    maxSize: "1024x1024",
    supportedStyles: null,
    isActive: true,
    description: "Google Imagen 3 — photorealistic generations.",
  },
];

/**
 * Minimal shape of the `generateContent` response when called against an
 * Imagen model. The SDK returns inline data with `data` (base64) and
 * `mimeType`.
 */
interface GoogleImageResponse {
  response?: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data: string; mimeType?: string };
          text?: string;
        }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: unknown;
  };
}

export class GoogleImageProvider extends BaseImageProvider {
  readonly id: ImageProviderId = "google";
  protected defaultModel = DEFAULT_MODEL;

  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (this.client) return this.client;
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";
    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
    }
    this.client = new GoogleGenerativeAI(apiKey);
    return this.client;
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const model = this.resolveModel(req);
    const client = this.getClient();
    try {
      // The Google Generative AI SDK exposes image generation via the
      // `generateContent` call on an Imagen model id. We feed the prompt
      // as the only content part.
      const generativeModel = client.getGenerativeModel({
        model,
        generationConfig: {
          // Imagen respects `responseModalities: ["IMAGE"]` via a
          // model-specific config; the SDK falls back to text when not set.
        },
      });

      const promptParts: string[] = [req.prompt];
      if (req.negativePrompt) {
        promptParts.push(`Negative: ${req.negativePrompt}`);
      }
      if (req.style) {
        promptParts.push(`Style: ${req.style}`);
      }
      if (req.size) {
        promptParts.push(`Size: ${req.size}`);
      }

      const result = (await generativeModel.generateContent(
        promptParts.join("\n"),
      )) as unknown as GoogleImageResponse;

      const parts =
        result.response?.candidates?.[0]?.content?.parts ?? [];
      const inlineData = parts.find((p) => !!p.inlineData)?.inlineData;
      if (!inlineData?.data) {
        throw this.normalizeError(
          new Error("Google Imagen returned no inline image data."),
          { model, op: "generate" },
        );
      }
      return {
        model,
        provider: this.id,
        url: null,
        b64: inlineData.data,
        mimeType: inlineData.mimeType ?? "image/png",
        seed: typeof req.seed === "number" ? req.seed : null,
        raw: result,
      };
    } catch (err) {
      throw this.normalizeError(err, { model, op: "generate" });
    }
  }

  async listModels(): Promise<ImageModel[]> {
    return MODELS;
  }
}
