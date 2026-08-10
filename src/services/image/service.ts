/**
 * Image generation orchestration service.
 * Resolves the provider, calls the adapter with retry/failover,
 * and returns the result. Tracks provider health.
 */

import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageEditRequest,
  ImageEditResponse,
} from "./types";
import { getImageProvider, getAllImageProviders } from "./providers/registry";
import { resolveImageProvider, getImageModelById } from "./models";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { logger } from "@/services/logger";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable: boolean }).retryable === true;
  }
  return false;
}

function extractProvider(error: unknown): string {
  if (error && typeof error === "object" && "provider" in error) {
    return String((error as { provider: string }).provider);
  }
  return "unknown";
}

async function recordProviderHealth(
  provider: string,
  model: string,
  success: boolean,
  latencyMs: number
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("provider_health")
      .select("*")
      .eq("provider", provider)
      .eq("model", model)
      .single();

    if (existing) {
      const totalOps = existing.success_count + existing.failure_count;
      const newAvgLatency =
        (existing.avg_latency_ms * totalOps + latencyMs) / (totalOps + 1);
      await supabase
        .from("provider_health")
        .update({
          is_healthy: success ? true : existing.failure_count < 5,
          avg_latency_ms: Math.round(newAvgLatency),
          success_count: existing.success_count + (success ? 1 : 0),
          failure_count: existing.failure_count + (success ? 0 : 1),
          last_checked_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("provider_health").insert({
        provider,
        model,
        is_healthy: success,
        avg_latency_ms: latencyMs,
        success_count: success ? 1 : 0,
        failure_count: success ? 0 : 1,
      });
    }
  } catch (err) {
    logger.warn("Failed to record provider health", { provider, model, error: err });
  }
}

/**
 * Generate an image through the provider abstraction layer.
 * Includes retry logic and provider health tracking.
 */
export async function generateImageFromProvider(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const providerId =
    request.model ? resolveImageProvider(request.model) : "unknown";

  logger.info("Generating image", {
    provider: providerId,
    model: request.model,
    size: request.settings.size,
    type: request.generationType,
  });

  const provider = getImageProvider(providerId);
  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await provider.generateImage(request);

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      // Record health
      await recordProviderHealth(providerId, request.model, true, latency);

      logger.info("Image generated successfully", {
        provider: providerId,
        model: request.model,
        latencyMs: latency,
        resultCount: response.results.length,
      });

      return response;
    } catch (error) {
      lastError = error;
      const retryable = isRetryable(error);
      const errProvider = extractProvider(error);

      logger.error("Image generation attempt failed", {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES + 1,
        retryable,
        provider: errProvider,
        model: request.model,
      });

      if (!retryable || attempt === MAX_RETRIES) {
        const latency = Date.now() - startTime;
        await recordProviderHealth(providerId, request.model, false, latency);
        break;
      }
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

/**
 * Edit an image via a provider that supports the operation.
 */
export async function editImageFromProvider(
  request: ImageEditRequest,
  preferredProvider?: string
): Promise<ImageEditResponse> {
  const providers = getAllImageProviders().filter(
    (p) => p.editImage && (!preferredProvider || p.providerId === preferredProvider)
  );

  if (providers.length === 0) {
    throw {
      message: `No provider supports the ${request.operation} operation`,
      code: "NO_PROVIDER",
      provider: preferredProvider ?? "none",
      retryable: false,
    };
  }

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const response = await provider.editImage!(request);
      return response;
    } catch (error) {
      lastError = error;
      logger.error("Image edit failed", {
        provider: provider.providerId,
        operation: request.operation,
      });
    }
  }

  throw lastError ?? { message: "All providers failed", code: "ALL_PROVIDERS_FAILED", provider: "", retryable: false };
}

/**
 * Attempt failover: try the same request with a different provider's model.
 */
export async function generateWithFailover(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const primaryProviderId = resolveImageProvider(request.model);

  try {
    return await generateImageFromProvider(request);
  } catch (primaryError) {
    if (!isRetryable(primaryError)) throw primaryError;

    logger.warn("Primary image provider failed, attempting failover", {
      primaryProvider: primaryProviderId,
      model: request.model,
    });

    const model = getImageModelById(request.model);
    if (!model) throw primaryError;

    const allProviders = getAllImageProviders();
    const alternatives = allProviders
      .filter((p) => p.providerId !== primaryProviderId)
      .flatMap((p) =>
        p
          .getAvailableModels()
          .filter(
            (m) =>
              m.enabled &&
              m.supportedGenerationTypes.includes(request.generationType)
          )
      );

    if (alternatives.length === 0) throw primaryError;

    const fallback = alternatives[0];
    logger.info("Failing over to alternative image model", {
      fallbackModel: fallback.id,
      fallbackProvider: fallback.provider,
    });

    return generateImageFromProvider({ ...request, model: fallback.id });
  }
}
