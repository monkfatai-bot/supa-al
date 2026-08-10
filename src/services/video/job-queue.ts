/**
 * Background job queue for video generation.
 * Uses in-memory polling for long-running async video jobs.
 * Jobs are persisted to the video_jobs table.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { getVideoProvider } from "./providers/registry";
import { resolveVideoProvider } from "./models";
import { downloadAndStoreVideo, downloadAndStoreThumbnail } from "./storage";
import { logger } from "@/services/logger";
import { createNotification } from "@/services/notification/actions";
import type { VideoGenerationRequest, VideoResultMetadata } from "./types";
import type { VideoJob } from "@/types/generated/database";
import type { Json } from "@/types/generated/database";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 600_000; // 10 minutes

/** Active polling jobs tracked in memory. */
const activeJobs = new Map<string, AbortController>();

/** Submit a video generation job: create DB records and start polling. */
export async function submitVideoJob(
  userId: string,
  generationId: string,
  request: VideoGenerationRequest
): Promise<VideoJob> {
  const supabase = await createServerSupabaseClient();
  const providerId = resolveVideoProvider(request.model);
  const provider = getVideoProvider(providerId);

  // Submit to provider
  const submitResult = await provider.submitJob(request);

  // Create job record
  const { data: job, error } = await supabase
    .from("video_jobs")
    .insert({
      user_id: userId,
      generation_id: generationId,
      provider: providerId,
      model: request.model,
      status: "queued",
      provider_job_id: submitResult.providerJobId,
      metadata: {
        estimatedTimeSeconds: submitResult.estimatedTimeSeconds ?? 120,
      } as Json,
    })
    .select()
    .single();

  if (error || !job) {
    throw new Error(`Failed to create video job: ${error?.message}`);
  }

  // Update generation with job reference
  await supabase
    .from("video_generations")
    .update({ job_id: job.id, status: "processing" })
    .eq("id", generationId);

  // Start background polling
  startPolling(job.id, userId, generationId, providerId, request.model, submitResult.providerJobId);

  return job;
}

/** Start polling a video job in the background. */
function startPolling(
  jobId: string,
  userId: string,
  generationId: string,
  providerId: string,
  model: string,
  providerJobId: string
): void {
  const controller = new AbortController();
  activeJobs.set(jobId, controller);

  const startTime = Date.now();

  const poll = async () => {
    try {
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_POLL_DURATION_MS || controller.signal.aborted) {
        await failJob(jobId, generationId, userId, "Job timed out");
        activeJobs.delete(jobId);
        return;
      }

      const provider = getVideoProvider(providerId);
      const pollResult = await provider.pollJob(providerJobId, model);

      // Update progress
      const supabase = await createServerSupabaseClient();
      await supabase
        .from("video_jobs")
        .update({
          status: pollResult.status,
          progress_percent: pollResult.progressPercent,
          started_at: pollResult.status === "processing" ? new Date().toISOString() : undefined,
        })
        .eq("id", jobId);

      if (pollResult.status === "completed" && pollResult.videoUrl) {
        await completeJob(jobId, generationId, userId, providerId, model, pollResult.videoUrl, pollResult.thumbnailUrl, pollResult.metadata);
        activeJobs.delete(jobId);
        return;
      }

      if (pollResult.status === "failed") {
        await failJob(jobId, generationId, userId, pollResult.errorMessage ?? "Provider generation failed");
        activeJobs.delete(jobId);
        return;
      }

      // Continue polling
      if (!controller.signal.aborted) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    } catch (err) {
      logger.error("Video job polling error", { jobId, error: err });
      await failJob(jobId, generationId, userId, "Polling error");
      activeJobs.delete(jobId);
    }
  };

  // Start first poll after initial delay
  setTimeout(poll, POLL_INTERVAL_MS);
}

/** Mark a job as completed and store the video. */
async function completeJob(
  jobId: string,
  generationId: string,
  userId: string,
  providerId: string,
  model: string,
  videoUrl: string,
  thumbnailUrl: string | undefined,
  metadata: VideoResultMetadata | undefined
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const startTime = Date.now();

  try {
    // Download video to Supabase Storage
    const videoStoragePath = await downloadAndStoreVideo(
      userId,
      "generated",
      videoUrl,
      `${generationId}.mp4`
    );

    let thumbnailStoragePath = "";
    if (thumbnailUrl) {
      thumbnailStoragePath = await downloadAndStoreThumbnail(
        userId,
        thumbnailUrl,
        generationId
      );
    }

    const generationTimeMs = Date.now() - startTime;

    // Update generation record
    await supabase
      .from("video_generations")
      .update({
        status: "completed",
        video_storage_path: videoStoragePath,
        thumbnail_storage_path: thumbnailStoragePath || null,
        duration_seconds: metadata?.durationSeconds ?? null,
        resolution: metadata ? `${metadata.width}x${metadata.height}` : null,
        fps: metadata?.fps ?? null,
        generation_time_ms: generationTimeMs,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    // Update job record
    await supabase
      .from("video_jobs")
      .update({
        status: "completed",
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Record usage
    const { data: gen } = await supabase
      .from("video_generations")
      .select("credits_used")
      .eq("id", generationId)
      .single();

    if (gen) {
      await supabase.from("video_usage").insert({
        user_id: userId,
        generation_id: generationId,
        provider: providerId,
        model,
        operation: "generate",
        credits_used: gen.credits_used,
        processing_ms: generationTimeMs,
        status: "success",
      });
    }

    // Notify user
    await createNotification(userId, "system", "Video Ready", `Your video generation is complete.`, "/video").catch(() => {});

    // Record provider health
    await recordVideoProviderHealth(providerId, model, true, generationTimeMs);

    logger.info("Video job completed", { jobId, generationId, userId, latencyMs: generationTimeMs });
  } catch (err) {
    logger.error("Failed to complete video job", { jobId, error: err });
    await failJob(jobId, generationId, userId, "Failed to store video result");
  }
}

/** Mark a job as failed and refund credits. */
async function failJob(
  jobId: string,
  generationId: string,
  userId: string,
  errorMessage: string
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("video_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // Refund credits
  const { data: gen } = await supabase
    .from("video_generations")
    .select("credits_used, provider, model")
    .eq("id", generationId)
    .single();

  if (gen && gen.credits_used > 0) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", userId)
      .single();
    if (profileRow) {
      await supabase
        .from("profiles")
        .update({ credits_balance: (profileRow.credits_balance ?? 0) + gen.credits_used })
        .eq("id", userId);
    }

    await supabase.from("video_usage").insert({
      user_id: userId,
      generation_id: generationId,
      provider: gen.provider,
      model: gen.model,
      operation: "refund",
      credits_refunded: gen.credits_used,
      status: "refunded",
      error_message: errorMessage,
    });
  }

  await supabase
    .from("video_generations")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", generationId);

  // Notify user
  await createNotification(userId, "system", "Video Failed", `Video generation failed: ${errorMessage}`, "/video").catch(() => {});

  logger.error("Video job failed", { jobId, generationId, errorMessage });
}

/** Cancel an active job. */
export async function cancelVideoJob(
  jobId: string,
  userId: string,
  providerId: string,
  model: string,
  providerJobId: string | null
): Promise<void> {
  // Stop polling
  const controller = activeJobs.get(jobId);
  if (controller) {
    controller.abort();
    activeJobs.delete(jobId);
  }

  // Cancel at provider
  if (providerJobId) {
    try {
      const provider = getVideoProvider(providerId);
      await provider.cancelJob?.(providerJobId, model);
    } catch {
      logger.warn("Provider cancel failed", { jobId, providerId });
    }
  }

  const supabase = await createServerSupabaseClient();

  // Refund credits
  const { data: gen } = await supabase
    .from("video_generations")
    .select("credits_used")
    .eq("job_id", jobId)
    .single();

  if (gen && gen.credits_used > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", userId)
      .single();
    if (profile) {
      await supabase
        .from("profiles")
        .update({ credits_balance: (profile.credits_balance ?? 0) + gen.credits_used })
        .eq("id", userId);
    }
  }

  await supabase
    .from("video_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId);

  await supabase
    .from("video_generations")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("job_id", jobId);
}

/** Get current status of a job (for client polling). */
export async function getVideoJobStatus(
  jobId: string,
  userId: string
): Promise<VideoJob | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  return data;
}

/** Record provider health for video providers. */
async function recordVideoProviderHealth(
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
    logger.warn("Failed to record video provider health", { provider, model, error: err });
  }
}

/** Get count of active (queued + processing) jobs for a user. */
export async function getActiveJobCount(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("video_jobs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "processing"]);

  return count ?? 0;
}
