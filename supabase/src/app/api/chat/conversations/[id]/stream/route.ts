/**
 * Supa AI — Streaming chat endpoint.
 *
 * POST `/api/chat/conversations/:id/stream`
 *
 * Body: `{content, provider?, model?, temperature?, maxTokens?, attachmentIds?}`
 *
 * Returns a `ReadableStream` of {@link ChatStreamChunk}s encoded as
 * Server-Sent Events (`data: {json}\n\n`). The terminal sentinel is
 * `data: [DONE]\n\n`. This is the **primary** chat endpoint — clients
 * should use this over the non-streaming `/messages` POST whenever they
 * support SSE.
 *
 * Flow:
 *   1. Validate input.
 *   2. `requireAuth()`.
 *   3. Rate-limit (AI_GENERATION preset).
 *   4. Fetch the conversation (verifies ownership).
 *   5. Build the messages array from history + the new user content.
 *   6. Call `chatService.streamResponse()` — yields chunks as they arrive.
 *   7. Pipe chunks to the client via {@link createSseResponse}.
 *
 * The chat service handles: credits check, user-message persistence, AI
 * failover, assistant-message persistence, usage recording, provider-health
 * updates, and credits deduction. On any unrecoverable error it yields an
 * error chunk (the SSE stream never throws — errors are encoded in-band).
 *
 * @module @/app/api/chat/conversations/[id]/stream/route
 */
import type { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/api-helpers";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createChatService, createSseResponse, sseDone, sseError } from "@/lib/chat";
import type { ChatMessage } from "@/lib/ai";
import { NotFoundError } from "@/lib/errors";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateInput } from "@/lib/validation";
import { sendMessageSchema } from "@/lib/validation/chat";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<Response> {
  try {
    const user = await requireAuth();
    const { id: conversationId } = await ctx.params;
    if (!conversationId) throw new NotFoundError("Conversation");

    // Rate-limit BEFORE parsing the body — a flood of malformed requests
    // shouldn't skip the limiter.
    await rateLimiter.consumePreset(
      `ai:${user.id}`,
      RATE_LIMIT_PRESETS.AI_GENERATION,
    );

    const body = await req.json();
    const input = validateInput(sendMessageSchema, {
      ...body,
      conversationId,
    });

    // Fetch the conversation (verifies ownership + gives us the system
    // prompt + prior message history).
    const supabase: AnySupabaseClient = await createSupabaseServerClient();
    const { data: conversation, error: convErr } = await supabase
      .from("ai_conversations")
      .select()
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (convErr) throw new Error(`Failed to load conversation: ${convErr.message}`);
    if (!conversation) throw new NotFoundError("Conversation", conversationId);

    // Read prior message history (capped to keep the context bounded).
    const { data: historyRows } = await supabase
      .from("ai_messages")
      .select()
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(50);

    // Build the messages array the AI facade expects. The chat service
    // prepends the conversation's system prompt (or its default mitigation
    // prompt) — the route only supplies the conversation history + the new
    // user message.
    const messages: ChatMessage[] = [];
    for (const row of historyRows ?? []) {
      if (row.role === "assistant" && row.finish_reason === "error") continue;
      if (row.role === "assistant" && !row.content) continue;
      messages.push({
        role: row.role as ChatMessage["role"],
        content: String(row.content ?? ""),
      });
    }
    messages.push({ role: "user", content: input.content });

    // Run the streaming chat service + pipe to the client as SSE.
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

    // The chat service may throw synchronously (e.g. PaymentError,
    // ValidationError) before yielding any chunks. We catch those and
    // encode them as a single error chunk + [DONE] so the client sees a
    // well-formed SSE stream either way.
    return createSseResponse(stream);
  } catch (err) {
    // Synchronous pre-stream error: encode as a single SSE error frame.
    // We import apiError's error envelope shape for consistency.
    const message =
      err instanceof Error ? err.message : "Stream failed to start.";
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    const body = `${sseError(message, code)}${sseDone()}`;
    return new Response(body, {
      status: 200, // 200 so the SSE parser runs; the error is in-band.
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
}
