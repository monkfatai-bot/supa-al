import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { logger } from "@/services/logger";
import type { AIMessage } from "@/services/ai/types";

// ── Conversation helpers ──────────────────────────────────────────────────
// These are server-only async functions (not server actions) because they are
// called from the API route handler, not directly from the client.

export interface ConversationRow {
  id: string;
  user_id: string;
  model_id: string;
  title: string;
  [key: string]: unknown;
}

export interface MessageRow {
  id?: string;
  role: string;
  content: string;
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Fetch a conversation by ID, scoped to a specific user.
 * Returns null when the conversation does not exist or does not belong to the user.
 */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationRow | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;
    return data as ConversationRow;
  } catch (error) {
    logger.error("Failed to fetch conversation", { conversationId, error: String(error) });
    return null;
  }
}

/**
 * Save a user message to the messages table.
 */
export async function saveUserMessage(
  conversationId: string,
  content: string,
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content,
    });
  } catch (error) {
    logger.error("Failed to save user message", { conversationId, error: String(error) });
  }
}

/**
 * Retrieve the message history for a conversation, ordered chronologically.
 */
export async function getMessageHistory(
  conversationId: string,
  limit?: number,
): Promise<AIMessage[]> {
  try {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (limit) query = query.limit(limit);

    const { data } = await query;
    return (data ?? []).map((m) => ({
      role: m.role as AIMessage["role"],
      content: m.content,
    }));
  } catch (error) {
    logger.error("Failed to load message history", { conversationId, error: String(error) });
    return [];
  }
}

/**
 * Save the assistant's response message and return the inserted row.
 */
export async function saveAssistantMessage(
  conversationId: string,
  content: string,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<MessageRow | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content,
        provider,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      })
      .select()
      .single();

    return data as MessageRow | null;
  } catch (error) {
    logger.error("Failed to save assistant message", { conversationId, error: String(error) });
    return null;
  }
}

/**
 * Log successful AI usage for billing/analytics.
 */
export async function logAiUsage(
  userId: string,
  conversationId: string,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
  estimatedCost: number,
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from("ai_usage").insert({
      user_id: userId,
      conversation_id: conversationId,
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
      processing_ms: 0,
      status: "success",
    });
  } catch (error) {
    logger.error("Failed to log AI usage", { conversationId, error: String(error) });
  }
}

/**
 * Log a failed AI usage attempt.
 */
export async function saveFailedUsage(
  userId: string,
  conversationId: string,
  provider: string,
  model: string,
  errorMessage: string,
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from("ai_usage").insert({
      user_id: userId,
      conversation_id: conversationId,
      provider,
      model,
      status: "failed",
      error_message: errorMessage,
      processing_ms: 0,
    });
  } catch (error) {
    logger.error("Failed to log failed AI usage", { conversationId, error: String(error) });
  }
}

/**
 * Save an error message as an assistant message in the conversation.
 */
export async function saveErrorMessage(
  conversationId: string,
  provider: string,
  model: string,
  errorMessage: string,
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: `Error: ${errorMessage}`,
      provider,
      model,
    });
  } catch (error) {
    logger.error("Failed to save error message", { conversationId, error: String(error) });
  }
}

/**
 * Auto-title a conversation based on the first user message.
 * Only titles when the conversation has ≤ 2 messages (user + this assistant reply).
 * Returns the auto-generated title or undefined.
 */
export async function autoTitleConversation(
  conversationId: string,
  firstMessage: string,
): Promise<string | undefined> {
  try {
    const supabase = await createServerSupabaseClient();
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (count !== null && count <= 2) {
      const title =
        firstMessage.length > 60
          ? firstMessage.slice(0, 60) + "..."
          : firstMessage;
      await supabase
        .from("conversations")
        .update({ title })
        .eq("id", conversationId);
      return title;
    }
  } catch (error) {
    logger.error("Failed to auto-title conversation", { conversationId, error: String(error) });
  }
  return undefined;
}
