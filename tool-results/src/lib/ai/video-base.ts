/**
 * Supa AI — Abstract video provider interface + shared base class.
 *
 * Every concrete video provider (Runway, Kling, Luma, …) implements
 * {@link VideoProviderClient}. The {@link BaseVideoProvider} abstract
 * class gives them shared helpers for logging, error normalization, and
 * config gating.
 *
 * Server-only: every concrete provider issues HTTP requests to an
 * external API and is never safe to import from client code.
 *
 * @module @/lib/ai/video-base
 */
import "server-only";

import { AIProviderError, ConfigurationError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

import type {
  VideoGenerateRequest,
  VideoGenerationResult,
  VideoJobPollResult,
  VideoModel,
  VideoProviderId,
  VideoUploadTarget,
} from "./video-types";

/** The contract every concrete video provider satisfies. */
export interface VideoProviderClient {
  readonly id: VideoProviderId;
  /**
   * Submit a generation request. Returns either:
   *   - a synchronous `completed` result with the URL, or
   *   - a `processing` result with an `externalJobId` the caller polls
   *     via {@link getJobStatus}.
   */
  generate(req: VideoGenerateRequest): Promise<VideoGenerationResult>;
  /**
   * Poll the provider for the latest status of a previously-submitted
   * job. Throws {@link AIProviderError} on transport failure.
   */
  getJobStatus(externalJobId: string): Promise<VideoJobPollResult>;
  /**
   * Request a pre-signed upload target for a source asset the provider
   * will then read by URL (used by providers that don't accept arbitrary
   * public URLs). Optional — providers that accept public URLs may throw
   * `ConfigurationError` when called.
   */
  getUploadTarget?(fileName: string, contentType: string): Promise<VideoUploadTarget>;
  /** Static catalog of models offered by this provider. */
  listModels(): Promise<VideoModel[]>;
}

/**
 * Shared helpers for concrete providers. Subclasses must implement
 * {@link generate}, {@link getJobStatus}, {@link listModels}, and provide
 * a static `defaultModel`.
 */
export abstract class BaseVideoProvider implements VideoProviderClient {
  abstract readonly id: VideoProviderId;
  protected abstract readonly defaultModel: string;

  abstract generate(req: VideoGenerateRequest): Promise<VideoGenerationResult>;
  abstract getJobStatus(externalJobId: string): Promise<VideoJobPollResult>;
  abstract listModels(): Promise<VideoModel[]>;

  /**
   * Resolve the model from the request or fall back to the provider's
   * default. Subclasses call this from inside `generate()`.
   */
  protected resolveModel(req: VideoGenerateRequest): string {
    return req.model ?? this.defaultModel;
  }

  /**
   * Guard the provider's entry point: throw {@link ConfigurationError}
   * when the configured env key is missing. Subclasses pass their
   * `apiKey` + the env-var name shown in the error message.
   */
  protected requireApiKey(apiKey: string | undefined, envVar: string): string {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new ConfigurationError(
        `Video provider "${this.id}" requires ${envVar} to be set.`,
        { provider: this.id, envVar },
      );
    }
    return apiKey;
  }

  /**
   * Normalize any thrown value into an {@link AIProviderError}. Subclasses
   * call this from their try/catch blocks around HTTP calls.
   */
  protected normalizeError(
    err: unknown,
    context?: Record<string, unknown>,
  ): AIProviderError {
    const appErr = toAppError(err);
    if (appErr instanceof AIProviderError) {
      return appErr;
    }
    const httpErr = err as {
      status?: number;
      message?: string;
      error?: { message?: string };
    };
    const message = httpErr?.error?.message ?? httpErr?.message ?? appErr.message;
    const status = httpErr?.status;
    return new AIProviderError(
      `${this.id} video provider error: ${message}`,
      {
        provider: this.id,
        status,
        ...context,
        cause: String(err),
      },
    );
  }

  /**
   * Issue a JSON HTTP request. Throws {@link AIProviderError} on a non-2xx
   * response; returns the parsed JSON body on success. Centralized so the
   * concrete providers stay narrow.
   */
  protected async http<T = unknown>(
    url: string,
    init: RequestInit & { authHeader?: string } = {},
  ): Promise<T> {
    const { authHeader, headers, ...rest } = init;
    const finalHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(headers as Record<string, string> | undefined),
    };
    if (authHeader) {
      finalHeaders.Authorization = authHeader;
    }
    if (rest.body !== undefined && !finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }

    try {
      const res = await fetch(url, { ...rest, headers: finalHeaders });
      const text = await res.text();
      const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        const message =
          (parsed as { error?: string; message?: string } | null)?.error ??
          (parsed as { message?: string } | null)?.message ??
          `HTTP ${res.status}`;
        throw new AIProviderError(
          `${this.id} video provider error: ${message}`,
          {
            provider: this.id,
            status: res.status,
            url,
            cause: text.slice(0, 500),
          },
        );
      }
      return parsed as T;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      // Network / DNS / TLS — surface as an AIProviderError.
      logger.warn("video provider HTTP error", {
        provider: this.id,
        url,
        error: String(err),
      });
      throw this.normalizeError(err, { url });
    }
  }
}
