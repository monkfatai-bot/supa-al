"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { generateImageFromProvider } from "./service";
import { getImageModelById, getDefaultImageModel } from "./models";
import { DEFAULT_IMAGE_SETTINGS, IMAGE_STYLE_PRESETS, ASPECT_RATIO_SIZE_MAP } from "./types";
import { logger } from "@/services/logger";
import type {
  AiImageGeneration,
  ImageAsset,
  ImagePrompt,
} from "@/types/generated/database";
import type {
  ImageGenerationSettings,
  ImageGenerationInput,
  ImageGenerationType,
  ImageEditOperation,
  PromptEnhancementResult,
  CreditCheckResult,
} from "./types";
import type { Json } from "@/types/generated/database";

// ─── Response Types ───────────────────────────────────────

export interface ImageActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface GenerateImageResponse extends ImageActionResponse {
  generation?: AiImageGeneration;
  assets?: ImageAsset[];
}

export interface ImageHistoryItem {
  generation: AiImageGeneration;
  asset: ImageAsset | null;
}

export interface ImageHistoryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  provider?: string;
  model?: string;
  isFavorite?: boolean;
  sortBy?: "created_at" | "provider" | "model";
  sortOrder?: "asc" | "desc";
}

export interface ImageHistoryResult {
  items: ImageHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ─── Constants ─────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 4000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
// ─── Style application ─────────────────────────────────────

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
}

// ─── Credit System ─────────────────────────────────────────

async function checkCredits(
  userId: string,
  requiredCredits: number
): Promise<CreditCheckResult> {
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();

  const currentBalance = profile?.credits_balance ?? 0;
  return {
    sufficient: currentBalance >= requiredCredits,
    currentBalance,
    requiredCredits,
  };
}

async function deductCredits(
  userId: string,
  amount: number
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();

  if (!data || data.credits_balance < amount) return false;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credits_balance: data.credits_balance - amount })
    .eq("id", userId);

  return !updateError;
}

async function refundCredits(
  userId: string,
  amount: number
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();

  if (data) {
    await supabase
      .from("profiles")
      .update({ credits_balance: data.credits_balance + amount })
      .eq("id", userId);
  }
}

async function recordUsage(
  userId: string,
  params: {
    generationId: string;
    provider: string;
    model: string;
    operation: string;
    creditsUsed: number;
    processingMs: number;
    status: string;
    errorMessage?: string;
  }
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("image_usage").insert({
    user_id: userId,
    generation_id: params.generationId,
    provider: params.provider,
    model: params.model,
    operation: params.operation,
    credits_used: params.creditsUsed,
    processing_ms: params.processingMs,
    status: params.status,
    error_message: params.errorMessage,
  });
}

// ─── Style application ─────────────────────────────────────

function applyStyleToPrompt(
  prompt: string,
  styleId: string
): string {
  if (styleId === "vivid" || styleId === "natural") return prompt;
  const preset = IMAGE_STYLE_PRESETS.find((s) => s.id === styleId);
  if (!preset) return prompt;
  return `${preset.promptPrefix}${prompt}${preset.promptSuffix}`;
}

// ─── Image Generation ─────────────────────────────────────

export async function generateImage(
  input: ImageGenerationInput
): Promise<GenerateImageResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Input validation
  const trimmed = sanitizePrompt(input.prompt);
  if (!trimmed) {
    return { success: false, message: "Prompt cannot be empty.", error: "EMPTY_PROMPT" };
  }
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return { success: false, message: `Prompt is too long (max ${MAX_PROMPT_LENGTH.toLocaleString()} characters).`, error: "PROMPT_TOO_LONG" };
  }

  const model = input.modelId
    ? getImageModelById(input.modelId) ?? getDefaultImageModel()
    : getDefaultImageModel();

  if (!model.enabled) {
    return { success: false, message: "This model is currently disabled.", error: "MODEL_DISABLED" };
  }

  const numImages = Math.min(
    input.settings?.numImages ?? 1,
    model.maxNumImages
  );

  // Apply style to prompt
  const styledPrompt = applyStyleToPrompt(trimmed, input.settings?.style ?? DEFAULT_IMAGE_SETTINGS.style);

  // Check credits
  const totalCredits = model.creditCost * numImages;
  const creditCheck = await checkCredits(profile.id, totalCredits);
  if (!creditCheck.sufficient) {
    return {
      success: false,
      message: `Insufficient credits. You need ${totalCredits} credits but have ${creditCheck.currentBalance}.`,
      error: "INSUFFICIENT_CREDITS",
    };
  }

  // Determine generation type
  let generationType: ImageGenerationType = "text-to-image";
  if (input.editOperation) generationType = "image-editing";
  if (input.sourceImageStoragePath) generationType = "image-to-image";

  // Resolve size from aspect ratio if not explicitly set
  const aspectRatio = input.settings?.aspectRatio ?? DEFAULT_IMAGE_SETTINGS.aspectRatio;
  const size = input.settings?.size ?? ASPECT_RATIO_SIZE_MAP[aspectRatio] ?? DEFAULT_IMAGE_SETTINGS.size;

  const mergedSettings: ImageGenerationSettings = {
    size,
    quality: input.settings?.quality ?? DEFAULT_IMAGE_SETTINGS.quality,
    style: input.settings?.style ?? DEFAULT_IMAGE_SETTINGS.style,
    aspectRatio,
    numImages,
    seed: input.settings?.seed,
    guidanceScale: input.settings?.guidanceScale,
    steps: input.settings?.steps,
    strength: input.settings?.strength,
  };

  // Deduct credits
  await deductCredits(profile.id, totalCredits);

  // 1. Create generation record
  const { data: generation, error: genError } = await supabase
    .from("ai_image_generations")
    .insert({
      user_id: profile.id,
      prompt: trimmed,
      negative_prompt: input.negativePrompt ?? "",
      provider: model.provider,
      model: model.id,
      status: "pending",
      settings: mergedSettings as unknown as Json,
      generation_type: generationType,
      aspect_ratio: aspectRatio,
      num_images: numImages,
      credits_used: totalCredits,
    })
    .select()
    .single();

  if (genError || !generation) {
    await refundCredits(profile.id, totalCredits);
    logger.error("Failed to create generation record", { reason: genError?.message });
    return { success: false, message: "Failed to start generation.", error: "CREATE_FAILED" };
  }

  // 2. Update status to processing
  await supabase
    .from("ai_image_generations")
    .update({ status: "processing" })
    .eq("id", generation.id);

  // 3. Fetch source image if needed
  let sourceImageBase64: string | undefined;
  if (input.sourceImageStoragePath) {
    const { data: fileData } = await supabase.storage
      .from("image-uploads")
      .download(input.sourceImageStoragePath);
    if (fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      sourceImageBase64 = buffer.toString("base64");
    }
  }

  // 4. Call AI provider
  const startTime = Date.now();
  let results: { imageData: string; revisedPrompt?: string; seed?: number }[];
  try {
    const response = await generateImageFromProvider({
      prompt: styledPrompt,
      negativePrompt: input.negativePrompt,
      model: model.id,
      settings: mergedSettings,
      generationType,
      sourceImageBase64,
      editMaskBase64: input.editMaskStoragePath ? undefined : undefined,
    });
    results = response.results;
  } catch (error) {
    const errMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "An unexpected error occurred while generating the image.";

    const processingMs = Date.now() - startTime;

    // Refund credits on failure
    await refundCredits(profile.id, totalCredits);

    await supabase
      .from("ai_image_generations")
      .update({
        status: "failed",
        error_message: errMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generation.id);

    // Record failed usage
    await recordUsage(profile.id, {
      generationId: generation.id,
      provider: model.provider,
      model: model.id,
      operation: generationType,
      creditsUsed: 0,
      processingMs,
      status: "failed",
      errorMessage: errMessage,
    });

    return { success: false, message: errMessage, error: "AI_ERROR" };
  }

  const processingMs = Date.now() - startTime;

  // 5. Upload all results to Supabase Storage and create asset records
  const assets: ImageAsset[] = [];
  const [width, height] = size.split("x").map(Number);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const buffer = Buffer.from(result.imageData, "base64");
    const suffix = results.length > 1 ? `_${i}` : "";
    const fileName = `${generation.id}${suffix}.png`;
    const storagePath = `${profile.id}/generated/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("image-assets")
      .upload(storagePath, buffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      logger.error("Failed to upload image to storage", {
        reason: uploadError.message,
        storagePath,
        index: i,
      });
      continue;
    }

    const { data: asset } = await supabase
      .from("image_assets")
      .insert({
        user_id: profile.id,
        generation_id: generation.id,
        storage_path: storagePath,
        metadata: {
          width,
          height,
          format: "png",
          revisedPrompt: result.revisedPrompt ?? null,
          sizeBytes: buffer.length,
          seed: result.seed ?? null,
        } as unknown as Json,
      })
      .select()
      .single();

    if (asset) assets.push(asset as ImageAsset);
  }

  // 6. Update generation as completed
  const { data: completedGen } = await supabase
    .from("ai_image_generations")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      generation_time_ms: processingMs,
    })
    .eq("id", generation.id)
    .select()
    .single();

  // Record successful usage
  await recordUsage(profile.id, {
    generationId: generation.id,
    provider: model.provider,
    model: model.id,
    operation: generationType,
    creditsUsed: totalCredits,
    processingMs,
    status: "success",
  });

  logger.info("Image generated successfully", {
    generationId: generation.id,
    model: model.id,
    size,
    numImages: results.length,
    processingMs,
  });

  revalidatePath("/image");

  return {
    success: true,
    message: `Image${results.length > 1 ? `s (${results.length})` : ""} generated.`,
    generation: completedGen ?? generation,
    assets: assets.length > 0 ? assets : undefined,
  };
}

// ─── Image History (with search, filter, sort, pagination) ─

export async function getImageHistory(
  params?: ImageHistoryParams
): Promise<ImageHistoryResult> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const page = params?.page ?? 1;
  const pageSize = Math.min(params?.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("ai_image_generations")
    .select("*", { count: "exact" })
    .eq("user_id", profile.id);

  if (params?.search) {
    query = query.ilike("prompt", `%${params.search}%`);
  }
  if (params?.provider) {
    query = query.eq("provider", params.provider);
  }
  if (params?.model) {
    query = query.eq("model", params.model);
  }
  if (params?.isFavorite !== undefined) {
    query = query.eq("is_favorite", params.isFavorite);
  }

  const sortBy = params?.sortBy ?? "created_at";
  const sortOrder = params?.sortOrder ?? "desc";
  query = query.order(sortBy, { ascending: sortOrder === "asc" });

  query = query.range(offset, offset + pageSize - 1);

  const { data: generations, count, error } = await query;

  if (error || !generations) {
    logger.error("Failed to fetch image generations", { reason: error?.message });
    return { items: [], totalCount: 0, page, pageSize };
  }

  const genIds = generations.map((g) => g.id);
  const { data: assets } =
    genIds.length > 0
      ? await supabase
          .from("image_assets")
          .select("*")
          .in("generation_id", genIds)
      : { data: [] };

  const assetMap = new Map<string, ImageAsset>();
  for (const a of assets ?? []) {
    if (!assetMap.has(a.generation_id)) {
      assetMap.set(a.generation_id, a as ImageAsset);
    }
  }

  const items: ImageHistoryItem[] = generations.map((gen) => ({
    generation: gen as AiImageGeneration,
    asset: assetMap.get(gen.id) ?? null,
  }));

  return { items, totalCount: count ?? 0, page, pageSize };
}

/** Backward-compatible overload without params */
export async function getImageHistorySimple(): Promise<ImageHistoryItem[]> {
  const result = await getImageHistory({ pageSize: 50 });
  return result.items;
}

// ─── Image Details ─────────────────────────────────────────

export async function getImageDetails(
  generationId: string
): Promise<ImageHistoryItem | null> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: generation, error } = await supabase
    .from("ai_image_generations")
    .select("*")
    .eq("id", generationId)
    .single();

  if (error || !generation) {
    logger.warn("Image generation not found", { generationId });
    return null;
  }

  const { data: asset } = await supabase
    .from("image_assets")
    .select("*")
    .eq("generation_id", generationId)
    .maybeSingle();

  return {
    generation: generation as AiImageGeneration,
    asset: (asset as ImageAsset) ?? null,
  };
}

// ─── Signed URLs ────────────────────────────────────────────

export async function getSignedImageUrl(storagePath: string): Promise<string | null> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from("image-assets")
    .createSignedUrl(storagePath, 3600);

  if (error) {
    logger.error("Failed to create signed URL", { reason: error.message, storagePath });
    return null;
  }

  return data.signedUrl;
}

export async function getSignedImageUrls(
  paths: string[]
): Promise<Map<string, string>> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const result = new Map<string, string>();
  for (const path of paths) {
    const { data, error } = await supabase.storage
      .from("image-assets")
      .createSignedUrl(path, 3600);

    if (!error && data) {
      result.set(path, data.signedUrl);
    }
  }

  return result;
}

// ─── Delete Image ──────────────────────────────────────────

export async function deleteImage(
  generationId: string
): Promise<ImageActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: assets } = await supabase
    .from("image_assets")
    .select("storage_path")
    .eq("generation_id", generationId);

  if (assets && assets.length > 0) {
    const paths = assets.map((a) => a.storage_path);
    await supabase.storage.from("image-assets").remove(paths);
  }

  const { error } = await supabase
    .from("ai_image_generations")
    .delete()
    .eq("id", generationId);

  if (error) {
    logger.error("Failed to delete image", { generationId, reason: error.message });
    return { success: false, message: "Failed to delete image.", error: "DELETE_FAILED" };
  }

  logger.info("Image deleted", { generationId });
  revalidatePath("/image");
  return { success: true, message: "Image deleted." };
}

// ─── Favorite ──────────────────────────────────────────────

export async function toggleFavoriteImage(
  generationId: string,
  isFavorite: boolean
): Promise<ImageActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("ai_image_generations")
    .update({ is_favorite: isFavorite })
    .eq("id", generationId);

  if (error) {
    logger.error("Failed to toggle favorite", { generationId, reason: error.message });
    return { success: false, message: "Failed to update favorite.", error: "UPDATE_FAILED" };
  }

  revalidatePath("/image");
  return { success: true, message: isFavorite ? "Added to favorites." : "Removed from favorites." };
}

// ─── Regenerate ────────────────────────────────────────────

export async function regenerateImage(
  generationId: string
): Promise<GenerateImageResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: original, error } = await supabase
    .from("ai_image_generations")
    .select("*")
    .eq("id", generationId)
    .single();

  if (error || !original) {
    return { success: false, message: "Original generation not found.", error: "NOT_FOUND" };
  }

  return generateImage({
    prompt: original.prompt,
    negativePrompt: original.negative_prompt || undefined,
    modelId: original.model,
    settings: original.settings as Partial<ImageGenerationSettings>,
  });
}

// ─── Duplicate ─────────────────────────────────────────────

export async function duplicateImage(
  generationId: string
): Promise<GenerateImageResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: original, error } = await supabase
    .from("ai_image_generations")
    .select("*")
    .eq("id", generationId)
    .single();

  if (error || !original) {
    return { success: false, message: "Original generation not found.", error: "NOT_FOUND" };
  }

  // Create a new generation record with the same settings but completed status
  // by copying the asset
  const { data: newGen, error: genError } = await supabase
    .from("ai_image_generations")
    .insert({
      user_id: profile.id,
      prompt: original.prompt,
      negative_prompt: original.negative_prompt,
      provider: original.provider,
      model: original.model,
      status: "completed",
      settings: original.settings,
      generation_type: original.generation_type,
      aspect_ratio: original.aspect_ratio,
      num_images: original.num_images,
      credits_used: 0,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (genError || !newGen) {
    return { success: false, message: "Failed to duplicate.", error: "DUPLICATE_FAILED" };
  }

  // Copy the asset
  const { data: originalAsset } = await supabase
    .from("image_assets")
    .select("*")
    .eq("generation_id", generationId)
    .single();

  let newAsset: ImageAsset | undefined;
  if (originalAsset) {
    // Copy the storage file
    const { data: fileData } = await supabase.storage
      .from("image-assets")
      .download(originalAsset.storage_path);

    if (fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const newStoragePath = `${profile.id}/generated/${newGen.id}.png`;
      const { error: uploadError } = await supabase.storage
        .from("image-assets")
        .upload(newStoragePath, buffer, {
          contentType: "image/png",
          upsert: false,
        });

      if (!uploadError) {
        const { data } = await supabase
          .from("image_assets")
          .insert({
            user_id: profile.id,
            generation_id: newGen.id,
            storage_path: newStoragePath,
            metadata: originalAsset.metadata,
          })
          .select()
          .single();
        newAsset = data as ImageAsset;
      }
    }
  }

  revalidatePath("/image");
  return {
    success: true,
    message: "Image duplicated.",
    generation: newGen as AiImageGeneration,
    assets: newAsset ? [newAsset] : undefined,
  };
}

// ─── Prompt Management ──────────────────────────────────────

export async function savePrompt(
  name: string,
  prompt: string
): Promise<ImageActionResponse & { prompt?: ImagePrompt }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const trimmedName = name.trim();
  const trimmedPrompt = sanitizePrompt(prompt);

  if (!trimmedPrompt) {
    return { success: false, message: "Prompt cannot be empty.", error: "EMPTY_PROMPT" };
  }

  const { data, error } = await supabase
    .from("image_prompts")
    .insert({
      user_id: profile.id,
      name: trimmedName || trimmedPrompt.slice(0, 60),
      prompt: trimmedPrompt,
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to save prompt", { reason: error.message });
    return { success: false, message: "Failed to save prompt.", error: "SAVE_FAILED" };
  }

  revalidatePath("/image");
  return { success: true, message: "Prompt saved.", prompt: data as ImagePrompt };
}

export async function getSavedPrompts(): Promise<ImagePrompt[]> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("image_prompts")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch saved prompts", { reason: error.message });
    return [];
  }

  return (data ?? []) as ImagePrompt[];
}

export async function deletePrompt(
  promptId: string
): Promise<ImageActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("image_prompts")
    .delete()
    .eq("id", promptId);

  if (error) {
    logger.error("Failed to delete prompt", { promptId, reason: error.message });
    return { success: false, message: "Failed to delete prompt.", error: "DELETE_FAILED" };
  }

  revalidatePath("/image");
  return { success: true, message: "Prompt deleted." };
}

// ─── Image Upload ───────────────────────────────────────────

export async function uploadImageForEditing(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  base64Data: string
): Promise<ImageActionResponse & { uploadId?: string; storagePath?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { success: false, message: "Unsupported file type. Use PNG, JPG, or WEBP.", error: "INVALID_TYPE" };
  }

  // Validate file size
  if (sizeBytes > MAX_FILE_SIZE) {
    return { success: false, message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`, error: "FILE_TOO_LARGE" };
  }

  // Validate base64
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    return { success: false, message: "Invalid image data.", error: "INVALID_DATA" };
  }

  if (buffer.length === 0) {
    return { success: false, message: "Empty image data.", error: "INVALID_DATA" };
  }

  // Try to get dimensions
  const width: number | null = null;
  const height: number | null = null;
  // For a production app, use a library like `probe-image-size` or `sharp`
  // Here we record them as null and they'd be set by a processing pipeline

  const storagePath = `${profile.id}/uploads/${Date.now()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("image-uploads")
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    logger.error("Failed to upload image for editing", {
      reason: uploadError.message,
      storagePath,
    });
    return { success: false, message: "Failed to upload image.", error: "UPLOAD_FAILED" };
  }

  const { data: upload, error: dbError } = await supabase
    .from("image_uploads")
    .insert({
      user_id: profile.id,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      width,
      height,
      storage_path: storagePath,
      status: "processed",
    })
    .select()
    .single();

  if (dbError) {
    logger.error("Failed to create upload record", { reason: dbError.message });
    return { success: false, message: "Failed to save upload record.", error: "DB_FAILED" };
  }

  return {
    success: true,
    message: "Image uploaded for editing.",
    uploadId: upload.id,
    storagePath,
  };
}

// ─── Prompt Enhancement ────────────────────────────────────

export async function enhancePrompt(
  prompt: string
): Promise<PromptEnhancementResult> {
  await requireAuth();

  const trimmed = sanitizePrompt(prompt);
  if (!trimmed || trimmed.length < 5) {
    return { enhancedPrompt: trimmed, suggestions: [] };
  }

  // Use AI chat to enhance the prompt
  const { sendChatMessage } = await import("@/services/ai/service");

  try {
    const response = await sendChatMessage({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert AI image prompt engineer. Given a basic image description, enhance it with vivid details, artistic direction, lighting, composition, and style cues. Return a JSON object with two keys: "enhanced" (the enhanced prompt, 2-4 sentences) and "suggestions" (an array of 3 alternative style variations, each 1 sentence). Return ONLY valid JSON, no markdown.`,
        },
        { role: "user", content: trimmed },
      ],
    });

    const parsed = JSON.parse(response.content) as {
      enhanced?: string;
      suggestions?: string[];
    };

    return {
      enhancedPrompt: parsed.enhanced ?? trimmed,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
    };
  } catch (error) {
    logger.warn("Prompt enhancement failed, returning original", { error });
    return { enhancedPrompt: trimmed, suggestions: [] };
  }
}

// ─── Image Editing ──────────────────────────────────────────

export async function editImage(
  generationId: string,
  operation: ImageEditOperation,
  editPrompt?: string
): Promise<GenerateImageResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Get the source image
  const { data: asset } = await supabase
    .from("image_assets")
    .select("*")
    .eq("generation_id", generationId)
    .single();

  if (!asset) {
    return { success: false, message: "Image asset not found.", error: "NOT_FOUND" };
  }

  const { data: fileData } = await supabase.storage
    .from("image-assets")
    .download(asset.storage_path);

  if (!fileData) {
    return { success: false, message: "Could not download source image.", error: "DOWNLOAD_FAILED" };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const imageBase64 = buffer.toString("base64");

  // Check credits
  const creditCost = operation === "upscaling" ? 3 : 2;
  const creditCheck = await checkCredits(profile.id, creditCost);
  if (!creditCheck.sufficient) {
    return {
      success: false,
      message: `Insufficient credits. Need ${creditCost}, have ${creditCheck.currentBalance}.`,
      error: "INSUFFICIENT_CREDITS",
    };
  }

  await deductCredits(profile.id, creditCost);

  // Get original generation for context
  const { data: original } = await supabase
    .from("ai_image_generations")
    .select("*")
    .eq("id", generationId)
    .single();

  // Create new generation record
  const { data: newGen, error: genError } = await supabase
    .from("ai_image_generations")
    .insert({
      user_id: profile.id,
      prompt: editPrompt ?? `Edit: ${original?.prompt ?? "image"}`,
      negative_prompt: "",
      provider: original?.provider ?? "stability",
      model: original?.model ?? "",
      status: "processing",
      settings: {},
      generation_type: operation,
      aspect_ratio: original?.aspect_ratio ?? "1:1",
      num_images: 1,
      credits_used: creditCost,
    })
    .select()
    .single();

  if (genError || !newGen) {
    await refundCredits(profile.id, creditCost);
    return { success: false, message: "Failed to start editing.", error: "CREATE_FAILED" };
  }

  const startTime = Date.now();

  try {
    const { editImageFromProvider } = await import("./service");
    const editResponse = await editImageFromProvider(
      {
        operation,
        imageBase64,
        prompt: editPrompt,
      },
      original?.provider
    );

    const processingMs = Date.now() - startTime;

    // Save edited image
    const editBuffer = Buffer.from(editResponse.imageData, "base64");
    const editedPath = `${profile.id}/edited/${newGen.id}.png`;

    const { error: uploadError } = await supabase.storage
      .from("image-assets")
      .upload(editedPath, editBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      await refundCredits(profile.id, creditCost);
      await supabase
        .from("ai_image_generations")
        .update({ status: "failed", error_message: "Upload failed", completed_at: new Date().toISOString() })
        .eq("id", newGen.id);
      return { success: false, message: "Edit succeeded but save failed.", error: "UPLOAD_FAILED" };
    }

    const { data: newAsset } = await supabase
      .from("image_assets")
      .insert({
        user_id: profile.id,
        generation_id: newGen.id,
        storage_path: editedPath,
        metadata: {
          width: (asset.metadata as { width?: number })?.width,
          height: (asset.metadata as { height?: number })?.height,
          format: "png",
          sizeBytes: editBuffer.length,
          editOperation: operation,
        } as unknown as Json,
      })
      .select()
      .single();

    await supabase
      .from("ai_image_generations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        generation_time_ms: processingMs,
      })
      .eq("id", newGen.id);

    await recordUsage(profile.id, {
      generationId: newGen.id,
      provider: editResponse.provider,
      model: "",
      operation,
      creditsUsed: creditCost,
      processingMs,
      status: "success",
    });

    revalidatePath("/image");

    return {
      success: true,
      message: `Image ${operation.replace(/-/g, " ")} completed.`,
      generation: newGen as AiImageGeneration,
      assets: newAsset ? [newAsset as ImageAsset] : undefined,
    };
  } catch (error) {
    const errMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : `Edit operation failed: ${operation}`;

    await refundCredits(profile.id, creditCost);

    await supabase
      .from("ai_image_generations")
      .update({
        status: "failed",
        error_message: errMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", newGen.id);

    return { success: false, message: errMessage, error: "EDIT_FAILED" };
  }
}

// ─── Get User Image Stats ───────────────────────────────────

export async function getImageStats() {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const [totalResult, favoriteResult, usageResult] = await Promise.all([
    supabase
      .from("ai_image_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id),
    supabase
      .from("ai_image_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("is_favorite", true),
    supabase
      .from("image_usage")
      .select("credits_used")
      .eq("user_id", profile.id),
  ]);

  const totalCreditsUsed = (usageResult.data ?? []).reduce(
    (sum, row) => sum + row.credits_used,
    0
  );

  return {
    totalGenerations: totalResult.count ?? 0,
    favorites: favoriteResult.count ?? 0,
    totalCreditsUsed,
  };
}