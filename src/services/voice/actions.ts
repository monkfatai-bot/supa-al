"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { submitTTS, submitSTT, submitCloneVoice, submitTranslation } from "./service";
import { submitVoiceJob, completeJob, cancelVoiceJob, getActiveJobCount } from "./job-queue";
import {
  uploadAudioFile,
  getSignedAudioUrl as getSignedAudioUrlFromStorage,
  getSignedAudioUrls,
  deleteAudioFiles,
  validateAudioUpload,
} from "./storage";
import { getVoiceModelById, getDefaultTTSModel, getDefaultSTTModel } from "./models";
import { DEFAULT_TTS_SETTINGS } from "./types";
import { logger } from "@/services/logger";
import type { VoiceOperationType } from "./types";
import type { VoiceGeneration, VoiceJob, VoiceProfile } from "@/types/generated/database";
import type { Json } from "@/types/generated/database";

// ─── Response Types ───────────────────────────────────────

export interface VoiceActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface TTSServerResponse extends VoiceActionResponse {
  generation?: VoiceGeneration;
  job?: VoiceJob;
}

export interface STTServerResponse extends VoiceActionResponse {
  generation?: VoiceGeneration;
}

export interface VoiceHistoryItem {
  generation: VoiceGeneration;
  job: VoiceJob | null;
}

export interface VoiceHistoryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  provider?: string;
  model?: string;
  operationType?: string;
  status?: string;
  isFavorite?: boolean;
  sortBy?: "created_at" | "provider" | "model";
  sortOrder?: "asc" | "desc";
}

export interface VoiceUploadResponse extends VoiceActionResponse {
  storagePath?: string;
}

export interface VoiceHistoryResult {
  items: VoiceHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ─── Sanitize Input ───────────────────────────────────────

function sanitizeInputLocal(text: string, maxLength: number = 5000): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLength);
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

// ─── Generate Speech (TTS) ─────────────────────────────────

export async function generateSpeech(input: {
  text: string;
  voiceId?: string;
  modelId?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  style?: string;
  outputFormat?: string;
  sampleRate?: number;
}): Promise<TTSServerResponse> {
  try {
    const profile = await requireAuth();
    const userId = profile.id;

    const modelId = input.modelId ?? getDefaultTTSModel().id;
    const model = getVoiceModelById(modelId);
    if (!model) {
      return { success: false, message: `Unknown model: ${modelId}` };
    }
    if (!model.enabled || !model.supportsTts) {
      return { success: false, message: `Model ${model.name} does not support TTS or is disabled.` };
    }

    const text = sanitizeInputLocal(input.text, model.characterLimit || 5000);
    if (!text) {
      return { success: false, message: "Text cannot be empty." };
    }

    // Check credits
    const hasCredits = await checkCredits(userId, model.creditCost);
    if (!hasCredits) {
      return { success: false, message: `Insufficient credits. This generation requires ${model.creditCost} credits.` };
    }

    // Deduct credits
    await deductCredits(userId, model.creditCost);

    // Create generation record
    const supabase = await createServerSupabaseClient();
    const settings: Record<string, unknown> = {
      ...DEFAULT_TTS_SETTINGS,
      voiceId: input.voiceId,
      language: input.language,
      speed: input.speed,
      pitch: input.pitch,
      volume: input.volume,
      emotion: input.emotion,
      style: input.style,
      outputFormat: input.outputFormat ?? "mp3",
      sampleRate: input.sampleRate,
    };

    const { data: generation, error: genError } = await supabase
      .from("voice_generations")
      .insert({
        user_id: userId,
        operation_type: "tts" as VoiceOperationType,
        provider: model.provider,
        model: model.id,
        status: "queued",
        input_text: text,
        voice_id: input.voiceId ?? null,
        output_format: (input.outputFormat ?? "mp3") as Json,
        sample_rate: input.sampleRate ?? null,
        settings: settings as Json,
        credits_used: model.creditCost,
      })
      .select()
      .single();

    if (genError || !generation) {
      // Refund credits
      await deductCredits(userId, -model.creditCost);
      return { success: false, message: `Failed to create generation: ${genError?.message}` };
    }

    // Execute TTS synchronously
    try {
      const result = await submitTTS(userId, {
        text,
        voiceId: input.voiceId,
        modelId: model.id,
        language: input.language,
        speed: input.speed,
        pitch: input.pitch,
        volume: input.volume,
        emotion: input.emotion,
        style: input.style,
        outputFormat: input.outputFormat ?? "mp3",
        sampleRate: input.sampleRate,
      });

      // Store audio to Supabase Storage
      const audioBuffer = Buffer.from(result.audioBase64, "base64");
      const storagePath = await uploadAudioFile(
        userId,
        "generated",
        `${generation.id}.${result.format}`,
        audioBuffer,
        `audio/${result.format}`
      );

      // Update generation record
      await supabase
        .from("voice_generations")
        .update({
          status: "completed",
          output_audio_path: storagePath,
          output_format: result.format as Json,
          processing_ms: result.latencyMs,
          file_size_bytes: audioBuffer.length,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation.id);

      // Create job record (completed)
      const job = await submitVoiceJob(userId, generation.id, null, result.provider, result.model);
      await completeJob(job.id, generation.id, userId, result.provider, result.model);

      revalidatePath("/voice");
      return { success: true, message: "Speech generated successfully.", generation, job };
    } catch (ttsError) {
      // Refund credits on failure
      await deductCredits(userId, -model.creditCost);

      const errorMessage = ttsError instanceof Error ? ttsError.message : "TTS generation failed";
      await supabase
        .from("voice_generations")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation.id);

      logger.error("TTS generation failed", { generationId: generation.id, error: ttsError });
      return { success: false, message: errorMessage };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate speech.";
    logger.error("generateSpeech failed", { error: err });
    return { success: false, message };
  }
}

// ─── Transcribe Audio (STT) ───────────────────────────────

export async function transcribeAudio(input: {
  audioBase64?: string;
  audioStoragePath?: string;
  language?: string;
  modelId?: string;
  enableDiarization?: boolean;
  enableTimestamps?: boolean;
  enableChapters?: boolean;
}): Promise<STTServerResponse> {
  try {
    const profile = await requireAuth();
    const userId = profile.id;

    const modelId = input.modelId ?? getDefaultSTTModel().id;
    const model = getVoiceModelById(modelId);
    if (!model) {
      return { success: false, message: `Unknown model: ${modelId}` };
    }
    if (!model.enabled || !model.supportsStt) {
      return { success: false, message: `Model ${model.name} does not support STT or is disabled.` };
    }

    // Check credits
    const hasCredits = await checkCredits(userId, model.creditCost);
    if (!hasCredits) {
      return { success: false, message: `Insufficient credits. This transcription requires ${model.creditCost} credits.` };
    }

    // Deduct credits
    await deductCredits(userId, model.creditCost);

    // Get audio data
    let audioBase64 = input.audioBase64 ?? "";
    let sourceAudioPath: string | null = null;

    if (!audioBase64 && input.audioStoragePath) {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.storage
        .from("audio-uploads")
        .download(input.audioStoragePath);
      if (data) {
        const buffer = await data.arrayBuffer();
        audioBase64 = Buffer.from(buffer).toString("base64");
        sourceAudioPath = input.audioStoragePath;
      } else {
        await deductCredits(userId, -model.creditCost);
        return { success: false, message: "Failed to download audio file from storage." };
      }
    }

    if (!audioBase64) {
      await deductCredits(userId, -model.creditCost);
      return { success: false, message: "No audio data provided." };
    }

    // Create generation record
    const supabase = await createServerSupabaseClient();
    const { data: generation, error: genError } = await supabase
      .from("voice_generations")
      .insert({
        user_id: userId,
        operation_type: "stt" as VoiceOperationType,
        provider: model.provider,
        model: model.id,
        status: "queued",
        input_language: input.language ?? null,
        source_audio_path: sourceAudioPath,
        settings: {
          enableDiarization: input.enableDiarization,
          enableTimestamps: input.enableTimestamps,
          enableChapters: input.enableChapters,
        } as Json,
        credits_used: model.creditCost,
      })
      .select()
      .single();

    if (genError || !generation) {
      await deductCredits(userId, -model.creditCost);
      return { success: false, message: `Failed to create generation: ${genError?.message}` };
    }

    // Execute STT
    try {
      const result = await submitSTT(userId, {
        audioBase64,
        audioStoragePath: sourceAudioPath ?? undefined,
        language: input.language,
        modelId: model.id,
        enableDiarization: input.enableDiarization,
        enableTimestamps: input.enableTimestamps,
        enableChapters: input.enableChapters,
      });

      // Update generation record
      await supabase
        .from("voice_generations")
        .update({
          status: "completed",
          transcript_text: result.transcript,
          transcript_data: {
            confidence: result.confidence,
            language: result.language,
            timestamps: result.timestamps ?? null,
            speakerLabels: result.speakerLabels ?? null,
            chapters: result.chapters ?? null,
          } as Json,
          processing_ms: result.latencyMs,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation.id);

      // Create transcript record
      await supabase.from("voice_transcripts").insert({
        user_id: userId,
        generation_id: generation.id,
        audio_storage_path: sourceAudioPath,
        language: result.language,
        confidence: result.confidence,
        transcript_text: result.transcript,
        speaker_labels: (result.speakerLabels ?? []) as Json,
        chapters: (result.chapters ?? []) as Json,
        timestamps: (result.timestamps ?? []) as Json,
      });

      revalidatePath("/voice");
      return { success: true, message: "Transcription completed.", generation };
    } catch (sttError) {
      await deductCredits(userId, -model.creditCost);

      const errorMessage = sttError instanceof Error ? sttError.message : "STT failed";
      await supabase
        .from("voice_generations")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation.id);

      logger.error("STT failed", { generationId: generation.id, error: sttError });
      return { success: false, message: errorMessage };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to transcribe audio.";
    logger.error("transcribeAudio failed", { error: err });
    return { success: false, message };
  }
}

// ─── Clone Voice ─────────────────────────────────────────

export async function cloneVoice(formData: FormData): Promise<VoiceActionResponse> {
  try {
    const profile = await requireAuth();
    const userId = profile.id;

    const name = formData.get("name") as string | null;
    const provider = formData.get("provider") as string | null;
    const description = formData.get("description") as string | null;
    const gender = formData.get("gender") as string | null;
    const language = formData.get("language") as string | null;
    const file = formData.get("file") as File | null;

    if (!name) {
      return { success: false, message: "Voice name is required." };
    }

    if (!provider) {
      return { success: false, message: "Provider is required." };
    }

    if (!file) {
      return { success: false, message: "Audio sample file is required." };
    }

    // Validate file
    const validation = validateAudioUpload(file.name, file.type, file.size);
    if (!validation.valid) {
      return { success: false, message: validation.error ?? "Invalid audio file." };
    }

    // Read audio
    const audioBuffer = await file.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // Upload sample to storage
    const sampleStoragePath = await uploadAudioFile(
      userId,
      "voice-samples",
      file.name,
      audioBuffer,
      file.type
    );

    try {
      const result = await submitCloneVoice(userId, {
        name,
        description: description ?? undefined,
        audioBase64,
        audioStoragePath: sampleStoragePath,
        provider,
        language: language ?? undefined,
        gender: gender ?? undefined,
      });

      // Create voice profile record
      const supabase = await createServerSupabaseClient();
      const { error: profileError } = await supabase
        .from("voice_profiles")
        .insert({
          user_id: userId,
          name,
          description: description ?? null,
          provider,
          provider_voice_id: result.providerVoiceId,
          sample_storage_path: sampleStoragePath,
          language: language ?? null,
          gender: gender ?? null,
          is_verified: true,
          consent_given: true,
          consent_given_at: new Date().toISOString(),
          metadata: {} as Json,
        });

      if (profileError) {
        logger.error("Failed to create voice profile", { error: profileError.message });
        return { success: false, message: `Voice cloned but failed to save profile: ${profileError.message}` };
      }

      revalidatePath("/voice");
      return { success: true, message: `Voice "${name}" cloned successfully.` };
    } catch (cloneError) {
      const message = cloneError instanceof Error ? cloneError.message : "Voice clone failed.";
      logger.error("cloneVoice failed", { error: cloneError });
      return { success: false, message };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to clone voice.";
    logger.error("cloneVoice failed", { error: err });
    return { success: false, message };
  }
}

// ─── Translate Audio ──────────────────────────────────────

export async function translateAudio(input: {
  audioBase64?: string;
  audioStoragePath?: string;
  inputLanguage: string;
  outputLanguage: string;
  modelId?: string;
}): Promise<VoiceActionResponse> {
  try {
    const profile = await requireAuth();
    const userId = profile.id;

    const modelId = input.modelId ?? "google-cloud-tts";
    const model = getVoiceModelById(modelId);
    if (!model || !model.enabled || !model.supportsTranslation) {
      return { success: false, message: `Translation model not available.` };
    }

    const hasCredits = await checkCredits(userId, model.creditCost);
    if (!hasCredits) {
      return { success: false, message: `Insufficient credits. Translation requires ${model.creditCost} credits.` };
    }

    await deductCredits(userId, model.creditCost);

    // Get audio data
    let audioBase64 = input.audioBase64 ?? "";
    if (!audioBase64 && input.audioStoragePath) {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.storage
        .from("audio-uploads")
        .download(input.audioStoragePath);
      if (data) {
        const buffer = await data.arrayBuffer();
        audioBase64 = Buffer.from(buffer).toString("base64");
      }
    }

    if (!audioBase64) {
      await deductCredits(userId, -model.creditCost);
      return { success: false, message: "No audio data provided." };
    }

    // Create generation record
    const supabase = await createServerSupabaseClient();
    const { data: generation, error: genError } = await supabase
      .from("voice_generations")
      .insert({
        user_id: userId,
        operation_type: "translate" as VoiceOperationType,
        provider: model.provider,
        model: model.id,
        status: "queued",
        input_language: input.inputLanguage,
        output_language: input.outputLanguage,
        source_audio_path: input.audioStoragePath ?? null,
        settings: {} as Json,
        credits_used: model.creditCost,
      })
      .select()
      .single();

    if (genError || !generation) {
      await deductCredits(userId, -model.creditCost);
      return { success: false, message: `Failed to create generation: ${genError?.message}` };
    }

    try {
      const result = await submitTranslation(userId, {
        audioBase64,
        audioStoragePath: input.audioStoragePath ?? undefined,
        inputLanguage: input.inputLanguage,
        outputLanguage: input.outputLanguage,
        modelId: model.id,
      });

      // Store translated audio
      const audioBuffer = Buffer.from(result.audioBase64, "base64");
      const storagePath = await uploadAudioFile(
        userId,
        "translated",
        `${generation.id}.${result.format}`,
        audioBuffer,
        `audio/${result.format}`
      );

      await supabase
        .from("voice_generations")
        .update({
          status: "completed",
          output_audio_path: storagePath,
          output_format: result.format as Json,
          processing_ms: result.latencyMs,
          file_size_bytes: audioBuffer.length,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation.id);

      revalidatePath("/voice");
      return { success: true, message: "Audio translated successfully." };
    } catch (translateError) {
      await deductCredits(userId, -model.creditCost);

      const errorMessage = translateError instanceof Error ? translateError.message : "Translation failed";
      await supabase
        .from("voice_generations")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation.id);

      return { success: false, message: errorMessage };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to translate audio.";
    logger.error("translateAudio failed", { error: err });
    return { success: false, message };
  }
}

// ─── Get Voice History ─────────────────────────────────────

export async function getVoiceHistory(
  params: VoiceHistoryParams = {}
): Promise<VoiceHistoryResult> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("voice_generations")
    .select("*, voice_jobs(*)", { count: "exact" })
    .eq("user_id", profile.id);

  if (params.search) {
    query = query.or(`input_text.ilike.%${params.search}%,transcript_text.ilike.%${params.search}%`);
  }
  if (params.provider) {
    query = query.eq("provider", params.provider);
  }
  if (params.model) {
    query = query.eq("model", params.model);
  }
  if (params.operationType) {
    query = query.eq("operation_type", params.operationType);
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

  const items: VoiceHistoryItem[] = (data ?? []).map((gen) => {
    const jobs = (gen as Record<string, unknown>).voice_jobs as VoiceJob[] | null;
    return {
      generation: gen as unknown as VoiceGeneration,
      job: jobs?.[0] ?? null,
    };
  });

  return { items, totalCount: count ?? 0, page, pageSize };
}

// ─── Get Voice Details ─────────────────────────────────────

export async function getVoiceDetails(generationId: string): Promise<VoiceHistoryItem | null> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("voice_generations")
    .select("*, voice_jobs(*)")
    .eq("id", generationId)
    .eq("user_id", profile.id)
    .single();

  if (!data) return null;

  const jobs = (data as Record<string, unknown>).voice_jobs as VoiceJob[] | null;
  return {
    generation: data as unknown as VoiceGeneration,
    job: jobs?.[0] ?? null,
  };
}

// ─── Cancel Job ───────────────────────────────────────────

export async function cancelJob(jobId: string): Promise<VoiceActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: job } = await supabase
      .from("voice_jobs")
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

    await cancelVoiceJob(jobId, profile.id, job.provider, job.model, job.provider_job_id);

    revalidatePath("/voice");
    return { success: true, message: "Job cancelled. Credits refunded." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel job.";
    logger.error("cancelJob failed", { error: err });
    return { success: false, message };
  }
}

// ─── Delete Voice ──────────────────────────────────────────

export async function deleteVoice(generationId: string): Promise<VoiceActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: gen } = await supabase
      .from("voice_generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", profile.id)
      .single();

    if (!gen) {
      return { success: false, message: "Voice generation not found." };
    }

    // Delete storage files
    const pathsToDelete: string[] = [];
    if (gen.output_audio_path) pathsToDelete.push(gen.output_audio_path);
    if (gen.source_audio_path) pathsToDelete.push(gen.source_audio_path);
    if (gen.subtitles_path) pathsToDelete.push(gen.subtitles_path);
    await deleteAudioFiles(pathsToDelete);

    // Delete DB records
    await supabase.from("voice_usage").delete().eq("generation_id", generationId);
    await supabase.from("voice_jobs").delete().eq("generation_id", generationId);
    await supabase.from("voice_transcripts").delete().eq("generation_id", generationId);
    await supabase.from("voice_generations").delete().eq("id", generationId);

    revalidatePath("/voice");
    return { success: true, message: "Voice generation deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete voice.";
    logger.error("deleteVoice failed", { error: err });
    return { success: false, message };
  }
}

// ─── Toggle Favorite ───────────────────────────────────────

export async function toggleFavoriteVoice(
  generationId: string,
  isFavorite: boolean
): Promise<VoiceActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("voice_generations")
      .update({ is_favorite: isFavorite })
      .eq("id", generationId)
      .eq("user_id", profile.id);

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/voice");
    return { success: true, message: isFavorite ? "Added to favorites." : "Removed from favorites." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update favorite.";
    logger.error("toggleFavoriteVoice failed", { error: err });
    return { success: false, message };
  }
}

// ─── Duplicate Voice Generation ───────────────────────────

export async function duplicateVoice(generationId: string): Promise<TTSServerResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: original } = await supabase
      .from("voice_generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", profile.id)
      .single();

    if (!original) {
      return { success: false, message: "Voice generation not found." };
    }

    // Re-run based on operation type
    const settings = original.settings as Record<string, unknown> | null;

    if (original.operation_type === "tts") {
      return await generateSpeech({
        text: original.input_text ?? "",
        voiceId: original.voice_id ?? undefined,
        modelId: original.model,
        language: original.input_language ?? undefined,
        outputFormat: (original.output_format as string) ?? undefined,
        ...(settings ? {
          speed: settings.speed as number | undefined,
          pitch: settings.pitch as number | undefined,
          volume: settings.volume as number | undefined,
          emotion: settings.emotion as string | undefined,
          style: settings.style as string | undefined,
          sampleRate: settings.sampleRate as number | undefined,
        } : {}),
      });
    }

    if (original.operation_type === "stt" && original.source_audio_path) {
      return await transcribeAudio({
        audioStoragePath: original.source_audio_path,
        language: original.input_language ?? undefined,
        modelId: original.model,
        ...(settings ? {
          enableDiarization: settings.enableDiarization as boolean | undefined,
          enableTimestamps: settings.enableTimestamps as boolean | undefined,
          enableChapters: settings.enableChapters as boolean | undefined,
        } : {}),
      });
    }

    return { success: false, message: `Cannot duplicate operation type: ${original.operation_type}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to duplicate voice.";
    logger.error("duplicateVoice failed", { error: err });
    return { success: false, message };
  }
}

// ─── Get Signed URLs ───────────────────────────────────────

export async function getSignedAudioUrl(
  storagePath: string
): Promise<string> {
  await requireAuth();

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("voice_generations")
    .select("id")
    .or(`output_audio_path.eq.${storagePath},source_audio_path.eq.${storagePath}`)
    .limit(1);

  if (!data || data.length === 0) {
    return "";
  }

  return getSignedAudioUrlFromStorage(storagePath);
}

export async function getSignedAudioUrlsForPaths(
  paths: string[]
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  return getSignedAudioUrls(paths);
}

// ─── Voice Profiles ───────────────────────────────────────

export async function getVoiceProfiles(): Promise<VoiceProfile[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("voice_profiles")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as VoiceProfile[];
}

export async function deleteVoiceProfile(profileId: string): Promise<VoiceActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: voiceProfile } = await supabase
      .from("voice_profiles")
      .select("*")
      .eq("id", profileId)
      .eq("user_id", profile.id)
      .single();

    if (!voiceProfile) {
      return { success: false, message: "Voice profile not found." };
    }

    // Delete storage files
    const pathsToDelete: string[] = [];
    if (voiceProfile.sample_storage_path) pathsToDelete.push(voiceProfile.sample_storage_path);
    if (voiceProfile.preview_storage_path) pathsToDelete.push(voiceProfile.preview_storage_path);
    await deleteAudioFiles(pathsToDelete);

    // Delete profile
    await supabase.from("voice_profiles").delete().eq("id", profileId);

    revalidatePath("/voice");
    return { success: true, message: "Voice profile deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete voice profile.";
    logger.error("deleteVoiceProfile failed", { error: err });
    return { success: false, message };
  }
}

// ─── Voice Stats ───────────────────────────────────────────

export async function getVoiceStats(): Promise<{
  totalGenerations: number;
  completedGenerations: number;
  processingGenerations: number;
  failedGenerations: number;
  activeJobs: number;
  voiceProfiles: number;
}> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { count: total } = await supabase
    .from("voice_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id);

  const { count: completed } = await supabase
    .from("voice_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("status", "completed");

  const { count: processing } = await supabase
    .from("voice_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .in("status", ["queued", "processing"]);

  const { count: failed } = await supabase
    .from("voice_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("status", "failed");

  const activeJobs = await getActiveJobCount(profile.id);

  const { count: profiles } = await supabase
    .from("voice_profiles")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id);

  return {
    totalGenerations: total ?? 0,
    completedGenerations: completed ?? 0,
    processingGenerations: processing ?? 0,
    failedGenerations: failed ?? 0,
    activeJobs,
    voiceProfiles: profiles ?? 0,
  };
}

// ─── Upload Source File ────────────────────────────────────

export async function uploadSourceFile(formData: FormData): Promise<VoiceUploadResponse> {
  try {
    const profile = await requireAuth();
    const userId = profile.id;
    const file = formData.get("file") as File | null;
    const purpose = (formData.get("purpose") as string) ?? "audio";

    if (!file) {
      return { success: false, message: "No file provided." };
    }

    const isImageInput = purpose === "image";
    const validation = validateAudioUpload(file.name, file.type, file.size, isImageInput);
    if (!validation.valid) {
      return { success: false, message: validation.error ?? "Invalid file." };
    }

    const buffer = await file.arrayBuffer();
    const folder = isImageInput ? "cloning-samples" : "uploads";
    const storagePath = await uploadAudioFile(userId, folder, file.name, buffer, file.type);

    // Record upload
    const supabase = await createServerSupabaseClient();
    await supabase.from("audio_uploads").insert({
      user_id: userId,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: storagePath,
      status: "processed",
    });

    return { success: true, message: "File uploaded.", storagePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    logger.error("uploadSourceFile failed", { error: err });
    return { success: false, message };
  }
}

// ─── Get Active Jobs for User ──────────────────────────────

export async function getActiveJobs(): Promise<VoiceJob[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("voice_jobs")
    .select("*")
    .eq("user_id", profile.id)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true });

  return (data ?? []) as VoiceJob[];
}
