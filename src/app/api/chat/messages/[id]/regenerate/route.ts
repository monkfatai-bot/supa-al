/**
 * Supa AI — Regenerate message route.
 *
 * POST `/api/chat/messages/:id/regenerate`
 *
 * Re-runs the conversation from the parent of `messageId`, producing a new
 * assistant message in a fresh branch (the new message's
 * `parent_message_id` is set to the original user message's id).
 *
 * Returns a streaming SSE response of {@link ChatStreamChunk}s — same wire
 * format as `/api/chat/conversations/:id/stream`.
 *
 * Requires a valid session + ownership of the message (verified via the
 * parent conversation).
 *
 * @module @/app/api/chat/messages/[id]/regenerate/route
 */
import type { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/api-helpers";
import { createChatService, createSseResponse, sseDone, sseError } from "@/lib/chat";
import { NotFoundError } from "@/lib/errors";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { validateInput } from "@/lib/validation";
import { regenerateSchema } from "@/lib/validation/chat";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<Response> {
  try {
    const user = await requireAuth();
    const { id: messageId } = await ctx.params;
    if (!messageId) throw new NotFoundError("Message");

    await rateLimiter.consumePreset(
      `ai:${user.id}`,
      RATE_LIMIT_PRESETS.AI_GENERATION,
    );

    const body = await req.json().catch(() => ({}));
    const input = validateInput(regenerateSchema, {
      ...body,
      messageId,
    });

    const chatService = createChatService();
    const stream = chatService.regenerate({
      userId: user.id,
      messageId: input.messageId,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });

    return createSseResponse(stream);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Regenerate failed to start.";
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    const body = `${sseError(message, code)}${sseDone()}`;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
}
