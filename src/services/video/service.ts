/**
 * Video generation orchestration service.
 * Resolves the provider, submits async jobs,
 * and manages failover. Tracks provider health.
 */

import type { VideoGenerationRequest } from "./types";
import { getVideoProvider, getAllVideoProviders } from "./providers/registry";
import { resolveVideoProvider, getVideoModelById } from "./models";
import { logger } from "@/services/logger";

function isRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable: boolean }).retryable === true;
  }
  return false;
}

/**
 * Submit a video generation job through the provider.
 * Handles provider resolution and error classification.
 */
export async function submitVideoGeneration(
  request: VideoGenerationRequest
): Promise<{ providerJobId: string; provider: string }> {
  const providerId = resolveVideoProvider(request.model);

  logger.info("Submitting video generation", {
    provider: providerId,
    model: request.model,
    type: request.generationType,
  });

  const provider = getVideoProvider(providerId);
  const result = await provider.submitJob(request);

  logger.info("Video generation submitted", {
    provider: providerId,
    model: request.model,
    providerJobId: result.providerJobId,
  });

  return { providerJobId: result.providerJobId, provider: providerId };
}

/**
 * Attempt failover: try submitting with a different provider's model.
 */
export async function submitWithFailover(
  request: VideoGenerationRequest
): Promise<{ providerJobId: string; provider: string }> {
  const primaryProviderId = resolveVideoProvider(request.model);

  try {
    return await submitVideoGeneration(request);
  } catch (primaryError) {
    if (!isRetryable(primaryError)) throw primaryError;

    logger.warn("Primary video provider failed for submit, attempting failover", {
      primaryProvider: primaryProviderId,
      model: request.model,
    });

    const model = getVideoModelById(request.model);
    if (!model) throw primaryError;

    const allProviders = getAllVideoProviders();
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
    logger.info("Failing over to alternative video model", {
      fallbackModel: fallback.id,
      fallbackProvider: fallback.provider,
    });

    return submitVideoGeneration({ ...request, model: fallback.id });
  }
}
