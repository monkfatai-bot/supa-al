/**
 * Background job queue for voice generation.
 * Uses in-memory polling for long-running async voice jobs.
 * Jobs are persisted to the voice_jobs table.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { getVoiceProvider } from "./providers/registry";
import { logger } from "@/services/logger";
import { createNotification } from "@/services/notification/actions";
import type { VoiceJob } from "@/types/generated/database";
import type { Json } from "@/types/generated/database";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 300_000; // 5 minutes

/** Active polling jobs tracked in memory. */
const activeJobs = new Map<string, AbortController>();

/** Submit a voice generation job: create DB records and start polling. */
export async function submitVoiceJob(
  userId: string,
  generationId: string,
  providerJobId: string | null,
  providerId: string,
  model: string
): Promise<VoiceJob> {
  const supabase = await createServerSupabaseClient();

  // Create job record
  const { data: job, error } = await supabase
    .from("voice_jobs")
    .insert({
      user_id: userId,
      generation_id: generationId,
      provider: providerId,
      model,
      status: "queued",
      provider_job_id: providerJobId,
      progress_percent: 0,
      attempt: 1,
      max_attempts: 3,
      metadata: {} as Json,
    })
    .select()
    .single();

  if (error || !job) {
    throw new Error(`Failed to create voice job: ${error?.message}`);
  }

  // Update generation with job reference
  await supabase
    .from("voice_generations")
    .update({ job_id: job.id, status: "processing" })
    .eq("id", generationId);

  return job;
}

/** Start polling a voice job in the background (for async providers). */
export function startPolling(
  jobId: string,
  userId: string,
  generationId: string,
  providerId: string,
  model: string,
  _providerJobId: string
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

      // Update progress
      const supabase = await createServerSupabaseClient();
      await supabase
        .from("voice_jobs")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      // Check if job already completed (synchronous case)
      const { data: gen } = await supabase
        .from("voice_generations")
        .select("status")
        .eq("id", generationId)
        .single();

      if (gen?.status === "completed") {
        await completeJob(jobId, generationId, userId, providerId, model);
        activeJobs.delete(jobId);
        return;
      }

      if (gen?.status === "failed") {
        activeJobs.delete(jobId);
        return;
      }

      // Continue polling
      if (!controller.signal.aborted) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    } catch (err) {
      logger.error("Voice job polling error", { jobId, error: err });
      await failJob(jobId, generationId, userId, "Polling error");
      activeJobs.delete(jobId);
    }
  };

  setTimeout(poll, POLL_INTERVAL_MS);
}

/** Mark a job as completed. */
export async function completeJob(
  jobId: string,
  generationId: string,
  userId: string,
  providerId: string,
  model: string
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  try {
    // Update job record
    await supabase
      .from("voice_jobs")
      .update({
        status: "completed",
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Record usage
    const { data: gen } = await supabase
      .from("voice_generations")
      .select("credits_used, processing_ms")
      .eq("id", generationId)
      .single();

    if (gen) {
      await supabase.from("voice_usage").insert({
        user_id: userId,
        generation_id: generationId,
        provider: providerId,
        model,
        operation: "tts",
        credits_used: gen.credits_used,
        processing_ms: gen.processing_ms,
        status: "success",
      });
    }

    // Notify user
    await createNotification(userId, "system", "Voice Ready", "Your voice generation is complete.", "/voice").catch(() => {});

    logger.info("Voice job completed", { jobId, generationId, userId, providerId });
  } catch (err) {
    logger.error("Failed to complete voice job", { jobId, error: err });
    await failJob(jobId, generationId, userId, "Failed to finalize voice result");
  }
}

/** Mark a job as failed and refund credits. */
export async function failJob(
  jobId: string,
  generationId: string,
  userId: string,
  errorMessage: string
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("voice_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // Refund credits
  const { data: gen } = await supabase
    .from("voice_generations")
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

    await supabase.from("voice_usage").insert({
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
    .from("voice_generations")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", generationId);

  await createNotification(userId, "system", "Voice Failed", `Voice generation failed: ${errorMessage}`, "/voice").catch(() => {});

  logger.error("Voice job failed", { jobId, generationId, errorMessage });
}

/** Cancel an active job. */
export async function cancelVoiceJob(
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
      const provider = getVoiceProvider(providerId);
      await provider.cancelJob?.(providerJobId, model);
    } catch {
      logger.warn("Provider cancel failed", { jobId, providerId });
    }
  }

  const supabase = await createServerSupabaseClient();

  // Refund credits
  const { data: gen } = await supabase
    .from("voice_generations")
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
    .from("voice_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId);

  await supabase
    .from("voice_generations")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("job_id", jobId);
}

/** Get current status of a job (for client polling). */
export async function getVoiceJobStatus(
  jobId: string,
  userId: string
): Promise<VoiceJob | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("voice_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  return data;
}

/** Get count of active (queued + processing) jobs for a user. */
export async function getActiveJobCount(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("voice_jobs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "processing"]);

  return count ?? 0;
}
