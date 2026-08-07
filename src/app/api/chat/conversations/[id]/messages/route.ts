/**
 * Supa AI — Messages list + non-streaming send route.
 *
 * GET  `/api/chat/conversations/:id/messages`  — paginated list of messages
 *                                                 in the conversation (asc
 *                                                 by created_at). Query
 *                                                 params: `limit`, `offset`,
 *                                                 `afterId`.
 * POST `/api/chat/conversations/:id/messages`  — NON-STREAMING send. The
 *                                                 primary chat endpoint is
 *                                                 `/stream` (SSE); this route
 *                                                 is a JSON fallback for
 *                                                 clients that don't support
 *                                                 SSE. Returns the user
 *                                                 message + the (buffered)
 *                                                 assistant message.
 *
 * Both require a valid session + ownership of the conversation.
 *
 * @module @/app/api/chat/conversations/[id]/messages/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createChatService, createMessageService } from "@/lib/chat";
import type { ChatMessage, ChatStreamChunk } from "@/lib/ai";
import { NotFoundError } from "@/lib/errors";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateInput } from "@/lib/validation";
import { sendMessageSchema } from "@/lib/validation/chat";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Conversation");

    const url = new URL(req.url);
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const afterId = url.searchParams.get("afterId") ?? undefined;

    const service = await createMessageService();
    const messages = await service.list(id, user.id, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      afterId,
    });

    return apiSuccess({ messages });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id: conversationId } = await ctx.params;
    if (!conversationId) throw new NotFoundError("Conversation");

    // Rate-limit the send endpoint with the AI_GENERATION preset.
    await rateLimiter.consumePreset(
      `ai:${user.id}`,
      RATE_LIMIT_PRESETS.AI_GENERATION,
    );

    const body = await req.json();
    const input = validateInput(sendMessageSchema, {
      ...body,
      conversationId,
    });

    // Build the messages array from the conversation's recent history + the
    // new user message. We read the conversation's system prompt + last N
    // messages, then append the new user message as the final entry.
    const supabase: AnySupabaseClient = await createSupabaseServerClient();
    const { data: conversation, error: convErr } = await supabase
      .from("ai_conversations")
      .select()
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (convErr) throw new Error(`Failed to load conversation: ${convErr.message}`);
    if (!conversation) throw new NotFoundError("Conversation", conversationId);

    const { data: historyRows } = await supabase
      .from("ai_messages")
      .select()
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(50);

    const messages: ChatMessage[] = [];
    for (const row of historyRows ?? []) {
      if (row.role === "assistant" && row.finish_reason === "error") continue;
      if (row.role === "assistant" && !row.content) continue;
      messages.push({
        role: row.role as ChatMessage["role"],
        content: String(row.content ?? ""),
      });
    }
    // Coerce input.content to string to satisfy TypeScript when the inferred
    // type is `unknown` during build-time.
    messages.push({ role: "user", content: String(input.content) });

    // Run the streaming chat service, but buffer the full response so we can
    // return it as a single JSON payload (non-streaming fallback).
    const chatService = createChatService();
    const stream = chatService.streamResponse({
      conversationId,
      userId: user.id,
      messages,
      provider: input.provider,
      model: input.model,
      systemPrompt: conversation.system_prompt ?? undefined,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });

    let assistantContent = "";
    let lastChunk: ChatStreamChunk | null = null;
    for await (const chunk of stream) {
      if (chunk.delta) assistantContent += chunk.delta;
      lastChunk = chunk;
    }

    return apiSuccess({
      content: assistantContent,
      finishReason: lastChunk?.finish_reason ?? "stop",
      usage: lastChunk?.usage,
    });
  } catch (err) {
    return apiError(err);
  }
}
