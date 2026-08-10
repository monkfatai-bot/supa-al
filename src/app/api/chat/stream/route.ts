import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/services/auth/session";
import { streamChatMessage } from "@/services/ai";
import { getModelById } from "@/services/ai/models";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/services/logger";
import {
  getConversation,
  saveUserMessage,
  getMessageHistory,
  saveAssistantMessage,
  logAiUsage,
  saveFailedUsage,
  saveErrorMessage,
  autoTitleConversation,
} from "@/services/chat/conversation-service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Rate limit: 20 streaming requests per minute per user. */
const STREAM_RATE_LIMIT = 20;
const STREAM_RATE_WINDOW = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limiting
    const rl = rateLimit(`chat:stream:${user.id}`, {
      limit: STREAM_RATE_LIMIT,
      windowSeconds: STREAM_RATE_WINDOW,
    });
    if (!rl.success) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait before sending more messages." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = (await request.json()) as {
      conversationId: string;
      message: string;
      model?: string;
    };

    const { conversationId, message: content, model: overrideModel } = body;

    // Input validation
    const trimmed = content.trim();
    if (!trimmed) {
      return new Response(JSON.stringify({ error: "Message cannot be empty." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (trimmed.length > 10_000) {
      return new Response(JSON.stringify({ error: "Message too long (max 10,000 chars)." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get conversation
    const conversation = await getConversation(user.id, conversationId);
    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const modelId = overrideModel ?? conversation.model_id;
    const modelInfo = getModelById(modelId);
    if (!modelInfo) {
      return new Response(JSON.stringify({ error: "Invalid model." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Save user message
    await saveUserMessage(conversationId, trimmed);

    // Build message history
    const aiMessages = await getMessageHistory(conversationId);

    // Create a ReadableStream that yields SSE events
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullContent = "";
        let responseModel = modelId;
        const responseProvider = modelInfo.provider;
        let usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

        try {
          const chatStream = streamChatMessage({
            model: modelId,
            messages: aiMessages,
          });

          for await (const chunk of chatStream) {
            if (chunk.done) {
              usage = chunk.usage;
              if (chunk.model) responseModel = chunk.model;
            } else {
              fullContent += chunk.content;
              if (chunk.model) responseModel = chunk.model;
            }

            const data = JSON.stringify({
              content: chunk.content,
              done: chunk.done,
              provider: chunk.provider,
              model: chunk.model,
              usage: chunk.done ? chunk.usage : undefined,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          // Save the assistant message
          const assistantMsg = await saveAssistantMessage(
            conversationId,
            fullContent,
            responseProvider,
            responseModel,
            usage?.inputTokens ?? 0,
            usage?.outputTokens ?? 0,
          );

          // Log usage
          await logAiUsage(
            user.id,
            conversationId,
            responseProvider,
            responseModel,
            usage?.inputTokens ?? 0,
            usage?.outputTokens ?? 0,
            usage?.totalTokens ?? 0,
            modelInfo.costPerRequest,
          );

          // Auto-title on first message
          const autoTitle = await autoTitleConversation(conversationId, trimmed);

          // Send final event with metadata
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, messageId: assistantMsg?.id, conversationTitle: autoTitle })}\n\n`
            )
          );
        } catch (error) {
          const errMsg = error && typeof error === "object" && "message" in error
            ? (error as { message: string }).message
            : "Streaming failed";

          logger.error("Chat streaming failed", {
            conversationId,
            model: modelId,
            error: errMsg,
          });

          // Log failed usage
          await saveFailedUsage(user.id, conversationId, modelInfo.provider, modelId, errMsg);

          // Save a placeholder error message
          await saveErrorMessage(conversationId, modelInfo.provider, modelId, errMsg);

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Internal server error";
    logger.error("Chat stream endpoint error", { error: errMsg });
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
