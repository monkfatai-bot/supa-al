import type { AIRequestConfig, AIResponse, AIStreamChunk } from "./types";
import { getProvider, getAllProviders } from "./registry";
import { resolveProviderFromModel, getModelById } from "./models";
import { logger } from "@/services/logger";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable: boolean }).retryable;
  }
  return false;
}

function extractProvider(error: unknown): string {
  if (error && typeof error === "object" && "provider" in error) {
    return String((error as { provider: string }).provider);
  }
  return "unknown";
}

/**
 * Send a chat message through the provider abstraction layer.
 * Resolves the provider from the model registry, delegates to the adapter,
 * handles retries for retryable errors, and normalises errors.
 */
export async function sendChatMessage(
  request: AIRequestConfig
): Promise<AIResponse> {
  const providerId = resolveProviderFromModel(request.model);

  logger.info("Sending chat message", {
    provider: providerId,
    model: request.model,
    messageCount: request.messages.length,
  });

  const provider = getProvider(providerId);

  // Create an AbortController with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await provider.chatCompletion({
        ...request,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      logger.info("Chat message succeeded", {
        provider: providerId,
        model: response.model,
        contentLength: response.content.length,
        usage: response.usage,
      });
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      const provider2 = extractProvider(error);
      const retryable = isRetryable(error);

      logger.error("AI chat message failed", {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES + 1,
        retryable,
        provider: provider2,
        model: request.model,
        code: error && typeof error === "object" && "code" in error ? (error as { code: string }).code : "UNKNOWN",
      });

      if (!retryable || attempt === MAX_RETRIES) break;
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

/**
 * Stream a chat message. Returns an async iterable of chunks.
 * Uses provider resolution from the model registry.
 */
export async function* streamChatMessage(
  request: AIRequestConfig
): AsyncIterable<AIStreamChunk> {
  const providerId = resolveProviderFromModel(request.model);
  const provider = getProvider(providerId);

  logger.info("Starting streaming chat message", {
    provider: providerId,
    model: request.model,
    messageCount: request.messages.length,
  });

  if (!provider.streamChatCompletion) {
    // Fallback: non-streaming response wrapped as a single chunk
    logger.warn("Provider does not support streaming, falling back to blocking call", { provider: providerId });
    try {
      const response = await sendChatMessage(request);
      yield {
        content: response.content,
        done: false,
        provider: response.provider,
        model: response.model,
      };
      yield {
        content: "",
        done: true,
        provider: response.provider,
        model: response.model,
        usage: response.usage,
      };
    } catch (error) {
      throw error;
    }
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const stream = provider.streamChatCompletion({ ...request, signal: controller.signal });
    for await (const chunk of stream) {
      if (chunk.done) {
        logger.info("Streaming completed", {
          provider: providerId,
          model: request.model,
          usage: chunk.usage,
        });
      }
      yield chunk;
    }
  } catch (error) {
    logger.error("Streaming chat message failed", {
      provider: providerId,
      model: request.model,
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Attempt failover: try the same request with a different provider's model.
 * Only used when the primary provider is completely unavailable.
 */
export async function sendWithFailover(
  request: AIRequestConfig
): Promise<AIResponse> {
  const primaryProviderId = resolveProviderFromModel(request.model);

  try {
    return await sendChatMessage(request);
  } catch (primaryError) {
    if (!isRetryable(primaryError)) throw primaryError;

    logger.warn("Primary provider failed, attempting failover", {
      primaryProvider: primaryProviderId,
      model: request.model,
    });

    // Try to find an alternative model from a different provider
    const model = getModelById(request.model);
    if (!model) throw primaryError;

    const alternatives = getAllProviders()
      .filter((p) => p.providerId !== primaryProviderId)
      .flatMap((p) => p.getAvailableModels().filter((m) => m.enabled));

    if (alternatives.length === 0) throw primaryError;

    const fallback = alternatives[0];
    logger.info("Failing over to alternative model", {
      fallbackModel: fallback.id,
      fallbackProvider: fallback.provider,
    });

    return sendChatMessage({ ...request, model: fallback.id });
  }
}
