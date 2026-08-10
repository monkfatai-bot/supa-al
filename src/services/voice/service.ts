/**
 * Voice generation orchestration service.
 * Resolves providers, delegates to adapters,
 * and manages error classification / provider health tracking.
 */

import type { TTSRequest, STTRequest, CloneVoiceRequest, TranslateAudioRequest } from "./types";
import { getVoiceProvider, getAllVoiceProviders } from "./providers/registry";
import { resolveVoiceProvider, getVoiceModelById } from "./models";
import { logger } from "@/services/logger";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

// ─── TTS Orchestration ────────────────────────────────────

/**
 * Submit a TTS request through the provider.
 */
export async function submitTTS(
  _userId: string,
  request: TTSRequest
): Promise<{ audioBase64: string; format: string; provider: string; model: string; latencyMs: number }> {
  const modelId = request.modelId ?? "openai-tts-1";
  const providerId = resolveVoiceProvider(modelId);
  const provider = getVoiceProvider(providerId);
  const startTime = Date.now();

  logger.info("Submitting TTS", { provider: providerId, model: modelId });

  const result = await provider.synthesizeSpeech({ ...request, modelId });
  const latencyMs = Date.now() - startTime;

  logger.info("TTS completed", { provider: providerId, model: modelId, latencyMs });

  await recordProviderHealth(providerId, modelId, true, latencyMs);

  return {
    audioBase64: result.audioBase64,
    format: result.format,
    provider: providerId,
    model: modelId,
    latencyMs,
  };
}

// ─── STT Orchestration ────────────────────────────────────

/**
 * Submit an STT request through the provider.
 */
export async function submitSTT(
  _userId: string,
  request: STTRequest
): Promise<{
    transcript: string;
    confidence: number;
    language: string;
    provider: string;
    model: string;
    latencyMs: number;
    timestamps?: Array<{ word: string; start: number; end: number }>;
    speakerLabels?: Array<{ speaker: string; start: number; end: number }>;
    chapters?: Array<{ start: number; end: number; headline: string; summary: string }>;
  }> {
  const modelId = request.modelId ?? "openai-whisper";
  const providerId = resolveVoiceProvider(modelId);
  const provider = getVoiceProvider(providerId);
  const startTime = Date.now();

  logger.info("Submitting STT", { provider: providerId, model: modelId });

  const result = await provider.transcribeSpeech({ ...request, modelId });
  const latencyMs = Date.now() - startTime;

  logger.info("STT completed", { provider: providerId, model: modelId, latencyMs });

  await recordProviderHealth(providerId, modelId, true, latencyMs);

  return {
    transcript: result.transcript,
    confidence: result.confidence,
    language: result.language,
    provider: providerId,
    model: modelId,
    latencyMs,
    timestamps: result.timestamps,
    speakerLabels: result.speakerLabels,
    chapters: result.chapters,
  };
}

// ─── Clone Voice Orchestration ─────────────────────────────

/**
 * Submit a voice clone request.
 */
export async function submitCloneVoice(
  _userId: string,
  request: CloneVoiceRequest
): Promise<{ providerVoiceId: string; provider: string }> {
  const providerId = request.provider;
  const provider = getVoiceProvider(providerId);
  const startTime = Date.now();

  logger.info("Submitting voice clone", { provider: providerId, name: request.name });

  const result = await provider.cloneVoice(request);
  const latencyMs = Date.now() - startTime;

  logger.info("Voice clone completed", { provider: providerId, providerVoiceId: result.providerVoiceId, latencyMs });

  await recordProviderHealth(providerId, `${providerId}-clone`, true, latencyMs);

  return { providerVoiceId: result.providerVoiceId, provider: providerId };
}

// ─── Translation Orchestration ─────────────────────────────

/**
 * Submit an audio translation request.
 */
export async function submitTranslation(
  _userId: string,
  request: TranslateAudioRequest
): Promise<{ audioBase64: string; format: string; provider: string; model: string; latencyMs: number }> {
  const modelId = request.modelId ?? "google-cloud-tts";
  const providerId = resolveVoiceProvider(modelId);
  const provider = getVoiceProvider(providerId);
  const startTime = Date.now();

  logger.info("Submitting audio translation", { provider: providerId, model: modelId });

  const result = await provider.translateAudio(request);
  const latencyMs = Date.now() - startTime;

  logger.info("Audio translation completed", { provider: providerId, model: modelId, latencyMs });

  await recordProviderHealth(providerId, modelId, true, latencyMs);

  return {
    audioBase64: result.audioBase64,
    format: result.format,
    provider: providerId,
    model: modelId,
    latencyMs,
  };
}

// ─── Provider Health ───────────────────────────────────────

/**
 * Record provider health for tracking.
 */
export async function recordProviderHealth(
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
      const newAvgLatency = (existing.avg_latency_ms * totalOps + latencyMs) / (totalOps + 1);
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
    logger.warn("Failed to record voice provider health", { provider, model, error: err });
  }
}

// ─── Failover ──────────────────────────────────────────────

function isRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable: boolean }).retryable === true;
  }
  return false;
}

/**
 * Attempt failover for TTS to an alternative provider.
 */
export async function submitTTSWithFailover(
  request: TTSRequest
): Promise<{ audioBase64: string; format: string; provider: string; model: string; latencyMs: number }> {
  const primaryModelId = request.modelId ?? "openai-tts-1";

  try {
    return await submitTTS("failover-user", request);
  } catch (primaryError) {
    if (!isRetryable(primaryError)) throw primaryError;

    logger.warn("Primary TTS provider failed, attempting failover", {
      primaryModel: primaryModelId,
    });

    const model = getVoiceModelById(primaryModelId);
    if (!model) throw primaryError;

    const allProviders = getAllVoiceProviders();
    const alternatives = allProviders
      .filter((p) => p.providerId !== model.provider)
      .flatMap((p) =>
        p
          .getAvailableModels()
          .filter((m) => m.enabled && m.supportsTts)
      );

    if (alternatives.length === 0) throw primaryError;

    const fallback = alternatives[0];
    logger.info("Failing over to alternative TTS model", {
      fallbackModel: fallback.id,
      fallbackProvider: fallback.provider,
    });

    return submitTTS("failover-user", { ...request, modelId: fallback.id });
  }
}
