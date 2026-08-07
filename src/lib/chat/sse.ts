/**
 * Supa AI — Server-Sent Events helpers.
 *
 * Encodes chat-stream chunks as SSE frames (`data: {json}\n\n`) and wraps an
 * async iterable into a `ReadableStream` so a Route Handler can return a
 * streaming `Response` without buffering every chunk in memory.
 *
 * The stream is built on `ReadableStream`'s `start(controller)` callback and
 * drained via a fire-and-forget async loop — the route returns the `Response`
 * immediately, and chunks are pushed to the controller as they arrive. The
 * loop closes the controller (sends `[DONE]`) when the iterable exhausts or
 * errors.
 *
 * Server-only: depends on the Web `ReadableStream` global, which is available
 * in both the Node.js and Edge runtimes used by Next.js Route Handlers.
 *
 * @module @/lib/chat/sse
 */
import "server-only";

import { logger } from "@/lib/logger";

/**
 * Encode a single SSE data frame. The payload is JSON-stringified and wrapped
 * in the canonical `data: <json>\n\n` framing per the SSE spec.
 *
 * Multi-line JSON strings are safe — `JSON.stringify` never emits raw
 * newlines, so each `data:` line carries one complete frame.
 */
export function sseChunk(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Encode an error frame. The payload is `{error, code?}` so the client can
 * distinguish error frames from data frames by the presence of the `error`
 * key. Still framed as `data: {json}\n\n` (so a single SSE parser handles it).
 */
export function sseError(message: string, code?: string): string {
  const payload: { error: string; code?: string } = { error: message };
  if (code) payload.code = code;
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Encode the terminal `[DONE]` sentinel. Mirrors the OpenAI streaming
 * convention: the client treats `[DONE]` as the end-of-stream marker.
 */
export function sseDone(): string {
  return "data: [DONE]\n\n";
}

/**
 * Wrap an async iterable of frames into a `ReadableStream<Uint8Array>` ready
 * to be returned from a Route Handler.
 *
 * Each yielded value is encoded with {@link sseChunk}; on completion the
 * stream emits {@link sseDone} and closes; on error it emits {@link sseError}
 * + {@link sseDone} and closes. The controller is never left dangling.
 *
 * The iterable yields arbitrary values — the encoder is the caller's
 * responsibility, so this helper works with any payload shape (typed by `T`).
 */
export function iterableToSseStream<T>(
  iterable: AsyncIterable<T>,
  encode: (value: T) => string = sseChunk as (value: T) => string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const value of iterable) {
          const frame = encode(value);
          controller.enqueue(encoder.encode(frame));
        }
        controller.enqueue(encoder.encode(sseDone()));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Stream error.";
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code)
            : undefined;
        controller.enqueue(encoder.encode(sseError(message, code)));
        controller.enqueue(encoder.encode(sseDone()));
        logger.warn("sse stream errored", { message, code, cause: String(err) });
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Build a streaming `Response` from an async iterable. The response carries
 * the SSE content-type and the standard no-cache / keep-alive headers so
 * proxies do not buffer the stream.
 *
 * @example
 * ```ts
 * export async function POST(req: NextRequest) {
 *   const stream = chatService.streamResponse({ ... });
 *   return createSseResponse(stream);
 * }
 * ```
 */
export function createSseResponse<T>(
  stream: AsyncIterable<T>,
  encode?: (value: T) => string,
): Response {
  const body = iterableToSseStream(stream, encode);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Nagle so chunks flush immediately — important for token
      // streaming UX (without this, browsers may coalesce frames).
      "X-Accel-Buffering": "no",
    },
  });
}
