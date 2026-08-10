"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { sendChatMessage } from "@/services/ai";
import { getDefaultModel } from "@/services/ai/models";
import { getSystemPrompt, getContentTypeLabel } from "./prompt-builder";
import { logger } from "@/services/logger";
import type {
  AiContent,
  ContentType,
  ContentActionResponse,
  GenerateContentResponse,
} from "./types";

/**
 * Get all content items for the current user, newest first.
 */
export async function getContentList(): Promise<AiContent[]> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ai_contents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch content list", { reason: error.message });
    return [];
  }

  return data ?? [];
}

/**
 * Get a single content item by ID.
 */
export async function getContentById(
  contentId: string
): Promise<AiContent | null> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ai_contents")
    .select("*")
    .eq("id", contentId)
    .single();

  if (error || !data) {
    logger.warn("Content not found", { contentId });
    return null;
  }

  return data;
}

/**
 * Generate content using AI and save it.
 */
export async function generateContent(
  prompt: string,
  contentType: ContentType
): Promise<GenerateContentResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Input validation
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { success: false, message: "Prompt cannot be empty.", error: "EMPTY_PROMPT" };
  }
  if (trimmed.length > 5000) {
    return { success: false, message: "Prompt is too long (max 5,000 characters).", error: "PROMPT_TOO_LONG" };
  }

  const model = getDefaultModel();
  const systemPrompt = getSystemPrompt(contentType);

  // Call AI provider
  let generatedContent: string;
  try {
    const response = await sendChatMessage({
      model: model.id,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: trimmed },
      ],
      temperature: 0.7,
      maxTokens: 2048,
    });
    generatedContent = response.content;
  } catch (error) {
    const errMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "An unexpected error occurred while generating content.";
    return { success: false, message: errMessage, error: "AI_ERROR" };
  }

  // Auto-generate title from prompt
  const title = trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed;
  const typeLabel = getContentTypeLabel(contentType);

  // Save to database
  const { data, error: dbError } = await supabase
    .from("ai_contents")
    .insert({
      user_id: profile.id,
      title: `[${typeLabel}] ${title}`,
      content_type: contentType,
      prompt: trimmed,
      generated_content: generatedContent,
    })
    .select()
    .single();

  if (dbError) {
    logger.error("Failed to save generated content", {
      reason: dbError.message,
    });
    return {
      success: false,
      message: "Content was generated but could not be saved.",
      error: "SAVE_FAILED",
    };
  }

  logger.info("Content generated", { contentId: data.id, contentType });
  revalidatePath("/content");
  return { success: true, message: "Content generated.", content: data };
}

/**
 * Update the generated content (editing).
 */
export async function updateContent(
  contentId: string,
  generatedContent: string,
  title?: string
): Promise<ContentActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const updates: { generated_content: string; title?: string } = {
    generated_content: generatedContent,
  };
  if (title !== undefined) {
    updates.title = title;
  }

  const { error } = await supabase
    .from("ai_contents")
    .update(updates)
    .eq("id", contentId);

  if (error) {
    logger.error("Failed to update content", {
      contentId,
      reason: error.message,
    });
    return { success: false, message: "Failed to update content.", error: "UPDATE_FAILED" };
  }

  logger.info("Content updated", { contentId });
  revalidatePath("/content");
  return { success: true, message: "Content updated." };
}

/**
 * Delete a content item.
 */
export async function deleteContent(
  contentId: string
): Promise<ContentActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("ai_contents")
    .delete()
    .eq("id", contentId);

  if (error) {
    logger.error("Failed to delete content", {
      contentId,
      reason: error.message,
    });
    return { success: false, message: "Failed to delete content.", error: "DELETE_FAILED" };
  }

  logger.info("Content deleted", { contentId });
  revalidatePath("/content");
  return { success: true, message: "Content deleted." };
}

/**
 * Regenerate content for an existing item using the original prompt.
 */
export async function regenerateContent(
  contentId: string
): Promise<GenerateContentResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch existing content
  const { data: existing, error: fetchError } = await supabase
    .from("ai_contents")
    .select("*")
    .eq("id", contentId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Content not found.", error: "NOT_FOUND" };
  }

  // Generate new content
  const model = getDefaultModel();
  const systemPrompt = getSystemPrompt(existing.content_type);

  let newContent: string;
  try {
    const response = await sendChatMessage({
      model: model.id,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: existing.prompt },
      ],
      temperature: 0.8,
      maxTokens: 2048,
    });
    newContent = response.content;
  } catch (error) {
    const errMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to regenerate content.";
    return { success: false, message: errMessage, error: "AI_ERROR" };
  }

  // Update the record
  const { data, error: updateError } = await supabase
    .from("ai_contents")
    .update({ generated_content: newContent })
    .eq("id", contentId)
    .select()
    .single();

  if (updateError) {
    logger.error("Failed to save regenerated content", {
      contentId,
      reason: updateError.message,
    });
    return { success: false, message: "Regeneration failed to save.", error: "SAVE_FAILED" };
  }

  logger.info("Content regenerated", { contentId });
  revalidatePath("/content");
  return { success: true, message: "Content regenerated.", content: data };
}
