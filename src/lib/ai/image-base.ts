/**
 * Supa AI — Abstract image provider interface + shared base class.
 *
 * Every concrete image provider (OpenAI DALL·E, Stability, Replicate, Fal,
 * Ideogram, Google Imagen) implements {@link ImageProviderClient}. The
 * {@link BaseImageProvider} abstract class gives them shared helpers for
 * error normalization, JSON fetching, and buffer fetching.
 *
 * Server-only.
 *
 * @module @/lib/ai/image-base
 */
import "server-only";

import { AIProviderError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

import type {
  ImageGenRequest,
  ImageGenResult,
  ImageModel,
  ImageProviderId,
} from "./image-types";

/** The contract every concrete image provider satisfies. */
export interface ImageProviderClient {
  readonly id: ImageProviderId;
  /** Generate an image from a text prompt (or apply an edit when `sourceImageUrl` is set). */
  generate(req: ImageGenRequest): Promise<ImageGenResult>;
  /** Static catalog of models offered by this provider. */
  listModels(): Promise<ImageModel[]>;
}

/**
 * Shared helpers for concrete providers. Subclasses must implement
 * {@link generate} and {@link listModels}.
 */
export abstract class BaseImageProvider implements ImageProviderClient {
  abstract readonly id: ImageProviderId;
  protected abstract readonly defaultModel: string;

  abstract generate(req: ImageGenRequest): Promise<ImageGenResult>;
  abstract listModels(): Promise<ImageModel[]>;

  /**
   * Normalize any thrown value into an {@link AIProviderError}. Subclasses
   * call this from their try/catch blocks.
   */
  protected normalizeError(
    err: unknown,
    context?: Record<string, unknown>,
  ): AIProviderError {
    const appErr = toAppError(err);
    if (appErr instanceof AIProviderError) {
      return appErr;
    }
    const sdkErr = err as {
      status?: number;
      message?: string;
      error?: { message?: string };
    };
    const message = sdkErr?.error?.message ?? sdkErr?.message ?? appErr.message;
    const status = sdkErr?.status;
    return new AIProviderError(
      `${this.id} image provider error: ${message}`,
      {
        provider: this.id,
        status,
        ...context,
        cause: String(err),
      },
    );
  }

  /** Resolve the model from the request or fall back to the provider default. */
  protected resolveModel(req: ImageGenRequest): string {
    return req.model ?? this.defaultModel;
  }

  /**
   * Issue a JSON HTTP request and return the parsed body. Throws an
   * {@link AIProviderError} on non-2xx responses. Used by providers that
   * hit REST endpoints directly (Stability, Replicate, Fal, Ideogram).
   */
  protected async fetchJson<T>(
    url: string,
    init: RequestInit = {},
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (!res.ok) {
        const text = await safeReadText(res);
        throw this.normalizeError(
          new Error(
            `${url} returned ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
          ),
          { url, status: res.status, ...context },
        );
      }
      const json = (await res.json()) as T;
      return json;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw this.normalizeError(err, { url, ...context });
    }
  }

  /**
   * Issue a binary HTTP request and return the response as a Base64 string.
   * Throws an {@link AIProviderError} on non-2xx responses. Used by providers
   * that return raw image bytes (Stability, Ideogram).
   */
  protected async fetchBuffer(
    url: string,
    init: RequestInit = {},
    context?: Record<string, unknown>,
  ): Promise<{ b64: string; mimeType: string }> {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const text = await safeReadText(res);
        throw this.normalizeError(
          new Error(
            `${url} returned ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
          ),
          { url, status: res.status, ...context },
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const mimeType = res.headers.get("content-type") ?? "image/png";
      return { b64: buf.toString("base64"), mimeType };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw this.normalizeError(err, { url, ...context });
    }
  }

  /** Compute the credits (USD cents) consumed for one image, given the model + quality. */
  protected estimateCredits(
    model: string,
    quality: string | undefined,
  ): number {
    // Rough per-image cost in USD cents. The image service deduces the final
    // amount from the catalog when available; this fallback keeps the
    // surface usable even when no pricing table is configured.
    const q = (quality ?? "standard").toLowerCase();
    if (q === "hd" || q === "high") return 8;
    if (q === "low") return 1;
    return 4;
  }
}

/** Read the response body as text without throwing on JSON parse failures. */
async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch (err) {
    logger.debug("failed to read error response text", { error: String(err) });
    return "";
  }
}
