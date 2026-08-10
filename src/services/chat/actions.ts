"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { sendChatMessage } from "@/services/ai";
import { getModelById, getDefaultModel } from "@/services/ai/models";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import type {
  Conversation,
  Message,
  ConversationWithMessageCount,
  CreateConversationResponse,
  SendMessageResponse,
  ChatActionResponse,
} from "./types";
import type { AIMessage } from "@/services/ai/types";

/** Rate limit: 20 messages per minute per user. */
const CHAT_RATE_LIMIT = 20;
const CHAT_RATE_WINDOW = 60;

/**
 * Get all conversations for the current user, newest first.
 * Pinned conversations appear first.
 */
export async function getConversations(): Promise<ConversationWithMessageCount[]> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("conversations")
    .select(`*, messages(count)`)
    .eq("is_archived", false)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch conversations", { reason: error.message });
    return [];
  }

  return (data ?? []).map((conv) => ({
    ...conv,
    message_count:
      (conv.messages as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

/**
 * Get a single conversation with its messages.
 */
export async function getConversation(
  conversationId: string
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) {
    logger.warn("Conversation not found", { conversationId });
    return null;
  }

  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (msgError) {
    logger.error("Failed to fetch messages", {
      conversationId,
      reason: msgError.message,
    });
    return { conversation, messages: [] };
  }

  return { conversation, messages: messages ?? [] };
}

/**
 * Create a new conversation.
 */
export async function createConversation(
  modelId?: string
): Promise<CreateConversationResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const model = modelId ? getModelById(modelId) ?? getDefaultModel() : getDefaultModel();

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: profile.id,
      title: "New Conversation",
      model_id: model.id,
      provider: model.provider,
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to create conversation", { reason: error.message });
    return { success: false, message: "Failed to create conversation.", error: "CREATE_FAILED" };
  }

  logger.info("Conversation created", { conversationId: data.id });
  await logActivity("chat_created", `Created conversation: ${data.id}`, {
    model_id: model.id,
    provider: model.provider,
  });
  revalidatePath("/chat");
  return { success: true, message: "Conversation created.", conversation: data };
}

/**
 * Delete a conversation and all its messages (cascaded).
 */
export async function deleteConversation(
  conversationId: string
): Promise<ChatActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (error) {
    logger.error("Failed to delete conversation", {
      conversationId,
      reason: error.message,
    });
    return { success: false, message: "Failed to delete conversation.", error: "DELETE_FAILED" };
  }

  logger.info("Conversation deleted", { conversationId });
  revalidatePath("/chat");
  return { success: true, message: "Conversation deleted." };
}

/**
 * Rename a conversation.
 */
export async function renameConversation(
  conversationId: string,
  title: string
): Promise<ChatActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 200) {
    return { success: false, message: "Title must be 1-200 characters.", error: "INVALID_TITLE" };
  }

  const { error } = await supabase
    .from("conversations")
    .update({ title: trimmed })
    .eq("id", conversationId);

  if (error) {
    logger.error("Failed to rename conversation", { conversationId, reason: error.message });
    return { success: false, message: "Failed to rename conversation.", error: "UPDATE_FAILED" };
  }

  revalidatePath("/chat");
  return { success: true, message: "Conversation renamed." };
}

/**
 * Archive or unarchive a conversation.
 */
export async function archiveConversation(
  conversationId: string,
  isArchived: boolean
): Promise<ChatActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("conversations")
    .update({ is_archived: isArchived })
    .eq("id", conversationId);

  if (error) {
    logger.error("Failed to archive conversation", { conversationId, reason: error.message });
    return { success: false, message: "Failed to update conversation.", error: "UPDATE_FAILED" };
  }

  revalidatePath("/chat");
  return { success: true, message: isArchived ? "Conversation archived." : "Conversation restored." };
}

/**
 * Pin or unpin a conversation.
 */
export async function pinConversation(
  conversationId: string,
  isPinned: boolean
): Promise<ChatActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("conversations")
    .update({ is_pinned: isPinned })
    .eq("id", conversationId);

  if (error) {
    logger.error("Failed to pin conversation", { conversationId, reason: error.message });
    return { success: false, message: "Failed to update conversation.", error: "UPDATE_FAILED" };
  }

  revalidatePath("/chat");
  return { success: true, message: isPinned ? "Conversation pinned." : "Conversation unpinned." };
}

/**
 * Search conversations by title.
 */
export async function searchConversations(
  query: string
): Promise<ConversationWithMessageCount[]> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select(`*, messages(count)`)
    .eq("is_archived", false)
    .ilike("title", `%${trimmed}%`)
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("Failed to search conversations", { reason: error.message });
    return [];
  }

  return (data ?? []).map((conv) => ({
    ...conv,
    message_count:
      (conv.messages as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

/**
 * Update the model used in a conversation.
 */
export async function updateConversationModel(
  conversationId: string,
  modelId: string
): Promise<ChatActionResponse> {
  await requireAuth();
  const model = getModelById(modelId);
  if (!model) {
    return { success: false, message: "Invalid model selected.", error: "INVALID_MODEL" };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("conversations")
    .update({ model_id: model.id, provider: model.provider })
    .eq("id", conversationId);

  if (error) {
    logger.error("Failed to update conversation model", { conversationId, reason: error.message });
    return { success: false, message: "Failed to switch model.", error: "UPDATE_FAILED" };
  }

  revalidatePath("/chat");
  return { success: true, message: "Model updated." };
}

/**
 * Send a message in a conversation:
 * 1. Rate limit check
 * 2. Save the user message
 * 3. Build context from previous messages
 * 4. Call AI provider
 * 5. Save the assistant response with usage data
 * 6. Track usage in ai_usage table
 * 7. Auto-generate a title on the first user message
 */
export async function sendMessage(
  conversationId: string,
  content: string
): Promise<SendMessageResponse> {
  const profile = await requireAuth();

  // Rate limiting
  const rateLimitResult = rateLimit(`chat:${profile.id}`, {
    limit: CHAT_RATE_LIMIT,
    windowSeconds: CHAT_RATE_WINDOW,
  });
  if (!rateLimitResult.success) {
    return { success: false, message: "Rate limit exceeded. Please wait a moment before sending more messages.", error: "RATE_LIMITED" };
  }

  const supabase = await createServerSupabaseClient();

  // Input validation
  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, message: "Message cannot be empty.", error: "EMPTY_MESSAGE" };
  }
  if (trimmed.length > 10_000) {
    return { success: false, message: "Message is too long (max 10,000 characters).", error: "MESSAGE_TOO_LONG" };
  }

  // Get the conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", profile.id)
    .single();

  if (convError || !conversation) {
    return { success: false, message: "Conversation not found.", error: "NOT_FOUND" };
  }

  // Save the user message
  const { error: userMsgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: trimmed,
  });

  if (userMsgError) {
    logger.error("Failed to save user message", { reason: userMsgError.message });
    return { success: false, message: "Failed to send message.", error: "SAVE_FAILED" };
  }

  // Build message context for the AI
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const aiMessages: AIMessage[] = (history ?? []).map((m) => ({
    role: m.role as AIMessage["role"],
    content: m.content,
  }));

  // Call the AI provider with timing
  const startTime = Date.now();
  let assistantContent: string;
  let responseModel = conversation.model_id;
  let responseProvider = conversation.provider;
  let usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

  try {
    const response = await sendChatMessage({
      model: conversation.model_id,
      messages: aiMessages,
    });
    assistantContent = response.content;
    responseModel = response.model;
    responseProvider = response.provider;
    usage = response.usage;
  } catch (error) {
    const errMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "An unexpected error occurred while communicating with the AI.";

    // Log failed usage
    const processingMs = Date.now() - startTime;
    await supabase.from("ai_usage").insert({
      user_id: profile.id,
      conversation_id: conversationId,
      provider: conversation.provider,
      model: conversation.model_id,
      processing_ms: processingMs,
      status: "failed",
      error_message: errMessage,
    });

    return { success: false, message: errMessage, error: "AI_ERROR" };
  }

  const processingMs = Date.now() - startTime;

  // Save the assistant message with provider/model/token data
  const { data: assistantMsg, error: assistMsgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantContent,
      provider: responseProvider,
      model: responseModel,
      input_tokens: usage?.inputTokens ?? 0,
      output_tokens: usage?.outputTokens ?? 0,
    })
    .select()
    .single();

  if (assistMsgError) {
    logger.error("Failed to save assistant message", {
      reason: assistMsgError.message,
    });
    return { success: false, message: "AI responded but failed to save the response.", error: "SAVE_FAILED" };
  }

  // Log usage in ai_usage table
  const modelInfo = getModelById(responseModel);
  await supabase.from("ai_usage").insert({
    user_id: profile.id,
    conversation_id: conversationId,
    provider: responseProvider,
    model: responseModel,
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    total_tokens: usage?.totalTokens ?? 0,
    estimated_cost: modelInfo?.costPerRequest ?? 0,
    processing_ms: processingMs,
    status: "success",
  });

  // Auto-generate title from first user message
  let conversationTitle: string | undefined;
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (count !== null && count <= 2) {
    const title = trimmed.length > 60 ? trimmed.slice(0, 60) + "..." : trimmed;
    const { error: titleError } = await supabase
      .from("conversations")
      .update({ title })
      .eq("id", conversationId);

    if (!titleError) {
      conversationTitle = title;
    }
  }

  revalidatePath("/chat");
  return {
    success: true,
    message: "Message sent.",
    assistantMessage: assistantMsg,
    conversationTitle,
  };
}
