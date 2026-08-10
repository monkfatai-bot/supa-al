"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { submitVideoJob, cancelVideoJob, getVideoJobStatus, getActiveJobCount } from "./job-queue";
import { uploadVideoFile, getSignedVideoUrl as getSignedVideoUrlFromStorage, getSignedVideoUrls, deleteVideoFiles } from "./storage";
import { validateVideoUpload } from "./storage";
import { getVideoModelById, getDefaultVideoModel } from "./models";
import { DEFAULT_VIDEO_SETTINGS } from "./types";
import { logger } from "@/services/logger";
import type {
  VideoGenerationType,
  VideoResolution,
  VideoAspectRatio,
  CameraMovement,
} from "./types";
import type { VideoGeneration, VideoJob } from "@/types/generated/database";
import type { Json } from "@/types/generated/database";

// ─── Response Types ───────────────────────────────────────

export interface VideoActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface GenerateVideoResponse extends VideoActionResponse {
  generation?: VideoGeneration;
  job?: VideoJob;
}

export interface VideoHistoryItem {
  generation: VideoGeneration;
  job: VideoJob | null;
}

export interface VideoHistoryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  provider?: string;
  model?: string;
  status?: string;
  isFavorite?: boolean;
  sortBy?: "created_at" | "provider" | "model";
  sortOrder?: "asc" | "desc";
}

export interface VideoHistoryResult {
  items: VideoHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ─── Sanitize prompt ───────────────────────────────────────

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .slice(0, 2000);
}

// ─── Check / Deduct Credits ───────────────────────────────

async function checkCredits(userId: string, required: number): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();
  return (data?.credits_balance ?? 0) >= required;
}

async function deductCredits(userId: string, amount: number): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();
  if (!data || data.credits_balance < amount) return false;
  await supabase
    .from("profiles")
    .update({ credits_balance: data.credits_balance - amount })
    .eq("id", userId);
  return true;
}

// ─── Generate Video ───────────────────────────────────────

export async function generateVideo(input: {
  prompt: string;
  negativePrompt?: string;
  modelId?: string;
  settings?: {
    resolution?: VideoResolution;
    aspectRatio?: VideoAspectRatio;
    durationSeconds?: number;
    fps?: number;
    seed?: number;
    motionStrength?: number;
    cameraMovement?: CameraMovement;
    creativity?: number;
  };
  sourceImageStoragePath?: string;
  generationType?: VideoGenerationType;
}): Promise<GenerateVideoResponse> {
  try {
    const profile = await requireAuth();
    const userId = profile.id;

    const modelId = input.modelId ?? getDefaultVideoModel().id;
    const model = getVideoModelById(modelId);
    if (!model) {
      return { success: false, message: `Unknown model: ${modelId}` };
    }
    if (!model.enabled) {
      return { success: false, message: `Model ${model.name} is not available yet.` };
    }

    const generationType = input.generationType ?? (input.sourceImageStoragePath ? "image-to-video" : "text-to-video");
    if (!model.supportedGenerationTypes.includes(generationType)) {
      return { success: false, message: `Model ${model.name} does not support ${generationType}.` };
    }

    const prompt = sanitizePrompt(input.prompt);
    if (!prompt) {
      return { success: false, message: "Prompt cannot be empty." };
    }

    const settings = {
      ...DEFAULT_VIDEO_SETTINGS,
      ...input.settings,
    };

    // Clamp duration
    if (settings.durationSeconds > model.maxDurationSeconds) {
      settings.durationSeconds = model.maxDurationSeconds;
    }
    if (settings.fps > model.maxFps) {
      settings.fps = model.maxFps;
    }

    // Check credits
    const hasCredits = await checkCredits(userId, model.creditCost);
    if (!hasCredits) {
      return { success: false, message: `Insufficient credits. This generation requires ${model.creditCost} credits.` };
    }

    // Deduct credits
    await deductCredits(userId, model.creditCost);

    // Read source image if image-to-video
    let sourceImageBase64: string | undefined;
    if (input.sourceImageStoragePath && generationType === "image-to-video") {
 const supabase = await createServerSupabaseClient();
      const { data } = await supabase.storage
        .from("video-uploads")
        .download(input.sourceImageStoragePath);
      if (data) {
        const buffer = await data.arrayBuffer();
        sourceImageBase64 = Buffer.from(buffer).toString("base64");
      }
    }

    // Create generation record
    const supabase = await createServerSupabaseClient();
    const { data: generation, error: genError } = await supabase
      .from("video_generations")
      .insert({
        user_id: userId,
        prompt,
        negative_prompt: input.negativePrompt ?? "",
        provider: model.provider,
        model: model.id,
        status: "queued",
        generation_type: generationType,
        settings: settings as Json,
        source_image_path: input.sourceImageStoragePath ?? null,
        aspect_ratio: settings.aspectRatio,
        credits_used: model.creditCost,
      })
      .select()
      .single();

    if (genError || !generation) {
      // Refund credits
      await deductCredits(userId, -model.creditCost);
      return { success: false, message: `Failed to create generation: ${genError?.message}` };
    }

    // Submit to provider via job queue
    const request = {
      prompt,
      negativePrompt: input.negativePrompt,
      model: model.id,
      settings: {
        resolution: settings.resolution,
        aspectRatio: settings.aspectRatio,
        durationSeconds: settings.durationSeconds,
        fps: settings.fps,
        seed: settings.seed,
        negativePrompt: input.negativePrompt,
        motionStrength: settings.motionStrength,
        cameraMovement: settings.cameraMovement,
        creativity: settings.creativity,
      },
      generationType,
      sourceImageBase64,
    };

    const job = await submitVideoJob(userId, generation.id, request);

    revalidatePath("/video");
    return { success: true, message: "Video generation started.", generation, job };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate video.";
    logger.error("generateVideo failed", { error: err });
    return { success: false, message };
  }
}

// ─── Upload Source File ───────────────────────────────────

export async function uploadSourceFile(formData: FormData): Promise<VideoActionResponse> {
  try {
    const profile = await requireAuth();
    const file = formData.get("file") as File | null;
    const purpose = (formData.get("purpose") as string) ?? "image";

    if (!file) {
      return { success: false, message: "No file provided." };
    }

    const isImageInput = purpose === "image";
    const validation = validateVideoUpload(file.name, file.type, file.size, isImageInput);
    if (!validation.valid) {
      return { success: false, message: validation.error ?? "Invalid file" };
    }

    const buffer = await file.arrayBuffer();
    const folder = isImageInput ? "uploads" : "uploads";
    const storagePath = await uploadVideoFile(profile.id, folder, file.name, buffer, file.type) ?? "";

    // Record upload
    const supabase = await createServerSupabaseClient();
    await supabase.from("video_uploads").insert({
      user_id: profile.id,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: storagePath,
      status: "processed",
    });

    return { success: true, message: "File uploaded.", error: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    logger.error("uploadSourceFile failed", { error: err });
    return { success: false, message };
  }
}

// ─── Get Video History ─────────────────────────────────────

export async function getVideoHistory(
  params: VideoHistoryParams = {}
): Promise<VideoHistoryResult> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("video_generations")
    .select("*, video_jobs(*)", { count: "exact" })
    .eq("user_id", profile.id);

  if (params.search) {
    query = query.ilike("prompt", `%${params.search}%`);
  }
  if (params.provider) {
    query = query.eq("provider", params.provider);
  }
  if (params.model) {
    query = query.eq("model", params.model);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.isFavorite !== undefined) {
    query = query.eq("is_favorite", params.isFavorite);
  }

  const sortBy = params.sortBy ?? "created_at";
  const sortOrder = params.sortOrder ?? "desc";
  query = query.order(sortBy, { ascending: sortOrder === "asc" });
  query = query.range(offset, offset + pageSize - 1);

  const { data, count } = await query;

  const items: VideoHistoryItem[] = (data ?? []).map((gen) => {
    const jobs = (gen as Record<string, unknown>).video_jobs as VideoJob[] | null;
    return {
      generation: gen as unknown as VideoGeneration,
      job: jobs?.[0] ?? null,
    };
  });

  return { items, totalCount: count ?? 0, page, pageSize };
}

/** Lightweight history fetch for initial page load. */
export async function getVideoHistorySimple(): Promise<VideoHistoryItem[]> {
  const result = await getVideoHistory({ pageSize: 20 });
  return result.items;
}

// ─── Get Video Details ─────────────────────────────────────

export async function getVideoDetails(generationId: string): Promise<VideoHistoryItem | null> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("video_generations")
    .select("*, video_jobs(*)")
    .eq("id", generationId)
    .eq("user_id", profile.id)
    .single();

  if (!data) return null;

  const jobs = (data as Record<string, unknown>).video_jobs as VideoJob[] | null;
  return {
    generation: data as unknown as VideoGeneration,
    job: jobs?.[0] ?? null,
  };
}

// ─── Get Job Status (for client polling) ───────────────────

export async function getJobStatus(jobId: string): Promise<VideoJob | null> {
  const profile = await requireAuth();
  return getVideoJobStatus(jobId, profile.id);
}

// ─── Cancel Job ───────────────────────────────────────────

export async function cancelJob(jobId: string): Promise<VideoActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: job } = await supabase
      .from("video_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", profile.id)
      .single();

    if (!job) {
      return { success: false, message: "Job not found." };
    }

    if (job.status !== "queued" && job.status !== "processing") {
      return { success: false, message: `Cannot cancel job in ${job.status} state.` };
    }

    await cancelVideoJob(jobId, profile.id, job.provider, job.model, job.provider_job_id);

    revalidatePath("/video");
    return { success: true, message: "Job cancelled. Credits refunded." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel job.";
    logger.error("cancelJob failed", { error: err });
    return { success: false, message };
  }
}

// ─── Delete Video ─────────────────────────────────────────

export async function deleteVideo(generationId: string): Promise<VideoActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: gen } = await supabase
      .from("video_generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", profile.id)
      .single();

    if (!gen) {
      return { success: false, message: "Video not found." };
    }

    // Delete storage files
    const pathsToDelete: string[] = [];
    if (gen.video_storage_path) pathsToDelete.push(gen.video_storage_path);
    if (gen.thumbnail_storage_path) pathsToDelete.push(gen.thumbnail_storage_path);
    if (gen.preview_gif_storage_path) pathsToDelete.push(gen.preview_gif_storage_path);
    await deleteVideoFiles(pathsToDelete);

    // Delete DB records
    await supabase.from("video_usage").delete().eq("generation_id", generationId);
    await supabase.from("video_jobs").delete().eq("generation_id", generationId);
    await supabase.from("video_generations").delete().eq("id", generationId);

    revalidatePath("/video");
    return { success: true, message: "Video deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete video.";
    logger.error("deleteVideo failed", { error: err });
    return { success: false, message };
  }
}

// ─── Toggle Favorite ───────────────────────────────────────

export async function toggleFavoriteVideo(
  generationId: string,
  isFavorite: boolean
): Promise<VideoActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("video_generations")
      .update({ is_favorite: isFavorite })
      .eq("id", generationId)
      .eq("user_id", profile.id);

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/video");
    return { success: true, message: isFavorite ? "Added to favorites." : "Removed from favorites." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update favorite.";
    return { success: false, message };
  }
}

// ─── Duplicate Video Generation ───────────────────────────

export async function duplicateVideo(generationId: string): Promise<GenerateVideoResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: original } = await supabase
      .from("video_generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", profile.id)
      .single();

    if (!original) {
      return { success: false, message: "Video not found." };
    }

    // Re-run the same generation
    const result = await generateVideo({
      prompt: original.prompt,
      negativePrompt: original.negative_prompt || undefined,
      modelId: original.model,
      sourceImageStoragePath: original.source_image_path ?? undefined,
      generationType: original.generation_type,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to duplicate video.";
    logger.error("duplicateVideo failed", { error: err });
    return { success: false, message };
  }
}

// ─── Get Signed URLs ───────────────────────────────────────

export async function getSignedVideoUrl(
  storagePath: string
): Promise<string> {
  const profile = await requireAuth();
  // Verify ownership by checking if a generation with this path belongs to user
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("video_generations")
    .select("id")
    .eq("user_id", profile.id)
    .or(`video_storage_path.eq.${storagePath},thumbnail_storage_path.eq.${storagePath}`)
    .limit(1);

  if (!data || data.length === 0) {
    return "";
  }

  return getSignedVideoUrlFromStorage(storagePath);
}

export async function getSignedVideoUrlsForPaths(
  paths: string[]
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  return getSignedVideoUrls(paths);
}

// ─── Get Video Stats ───────────────────────────────────────

export async function getVideoStats(): Promise<{
  totalGenerations: number;
  completedGenerations: number;
  processingGenerations: number;
  failedGenerations: number;
  activeJobs: number;
}> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { count: total } = await supabase
    .from("video_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id);

  const { count: completed } = await supabase
    .from("video_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("status", "completed");

  const { count: processing } = await supabase
    .from("video_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .in("status", ["queued", "processing"]);

  const { count: failed } = await supabase
    .from("video_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("status", "failed");

  const activeJobs = await getActiveJobCount(profile.id);

  return {
    totalGenerations: total ?? 0,
    completedGenerations: completed ?? 0,
    processingGenerations: processing ?? 0,
    failedGenerations: failed ?? 0,
    activeJobs,
  };
}

// ─── Get Active Jobs for User ─────────────────────────────

export async function getActiveJobs(): Promise<VideoJob[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("user_id", profile.id)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true });

  return (data ?? []) as VideoJob[];
}
