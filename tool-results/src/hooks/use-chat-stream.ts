"use client";

/**
 * Supa AI — Chat SSE streaming hook (Phase 3).
 *
 * `useChatStream` is the primary chat-send primitive. It POSTs the user
 * message to `/api/chat/conversations/:id/stream` (the SSE endpoint),
 * parses the resulting `text/event-stream` body via a `fetch` +
 * `ReadableStream` reader (NOT `EventSource` — that doesn't support
 * POST + auth cookies), and accumulates the `delta` field of every
 * `ChatStreamChunk` into a `partialMessage` string that the UI renders
 * in real time.
 *
 * Streaming protocol (server contract — see `src/lib/chat/sse.ts`):
 *
 *   - Each frame is `data: {json}\n\n`.
 *   - `ChatStreamChunk = { delta: string, finish_reason?, usage? }`.
 *   - The terminal sentinel is `data: [DONE]\n\n`.
 *   - Errors are encoded in-band as `{ error, code? }` so the parser
 *     never throws — the hook surfaces them via the `onError` callback.
 *
 * The hook stores its streaming state (`isGenerating`,
 * `partialMessage`, `streamingConversationId`) in the shared
 * {@link useChatStore} Zustand store so the composer / sidebar /
 * window can all read them without prop-drilling.
 *
 * After the stream completes (or aborts, or fails) the hook
 * invalidates the `messages` query for that conversation so the
 * persisted assistant message (saved server-side after `[DONE]`)
 * replaces the in-flight partial in the UI.
 *
 * @module @/hooks/use-chat-stream
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { ChatStreamChunk, TokenUsage } from "@/lib/ai/types";
import { useChatStore } from "@/stores/chat-store";
import {
  chatKeys,
  type ChatApiError,
  type RegenerateInput,
  type SendMessageInput,
} from "@/hooks/use-chat";

/** Result of {@link useChatStream}. */
export interface UseChatStreamResult {
  /** True while an SSE stream is in flight. */
  isGenerating: boolean;
  /** The in-flight assistant content (accumulated SSE deltas). */
  partialMessage: string | null;
  /**
   * Send a message: POST `/api/chat/conversations/:id/stream`.
   *
   * Resolves with `{ content, usage, finishReason }` once the stream
   * completes. Rejects with a {@link ChatApiError} if the stream
   * fails to start, aborts, or yields an error chunk.
   */
  sendMessage: (
    conversationId: string,
    input: SendMessageInput,
  ) => Promise<StreamResult>;
  /**
   * Regenerate from a parent message: POST
   * `/api/chat/messages/:id/regenerate`. Same streaming protocol.
   */
  regenerate: (
    messageId: string,
    conversationId: string,
    input?: RegenerateInput,
  ) => Promise<StreamResult>;
  /** Abort the in-flight stream (no-op if none is active). */
  stopGeneration: () => void;
}

/** Result returned by `sendMessage` / `regenerate` once the stream ends. */
export interface StreamResult {
  /** Full accumulated assistant text. */
  content: string;
  /** Why the model stopped generating (the last `finish_reason`). */
  finishReason: string | null;
  /** Token usage (carried on the final chunk only — may be `null`). */
  usage: TokenUsage | null;
}

/**
 * Parse a `ChatStreamChunk` from a single `data:` payload string.
 *
 * The payload may be:
 *   - `[DONE]`         — terminal sentinel → returns `null`.
 *   - `{...}`          — a JSON-encoded `ChatStreamChunk` or
 *                        `{ error, code? }` error frame.
 *   - anything else    — treated as a raw text delta (defensive — the
 *                        server always emits JSON, but we don't want a
 *                        stray line to crash the reader).
 *
 * @returns A discriminated union:
 *   - `{ kind: "chunk", chunk }`     — a normal content/usage chunk.
 *   - `{ kind: "error", error }`     — an in-band error frame.
 *   - `{ kind: "done" }`             — the terminal sentinel.
 *   - `{ kind: "ignore" }`           — a comment / heartbeat / blank line.
 */
type SseFrame =
  | { kind: "chunk"; chunk: ChatStreamChunk }
  | { kind: "error"; error: { message: string; code?: string } }
  | { kind: "done" }
  | { kind: "ignore" };

function parseSsePayload(payload: string): SseFrame {
  const trimmed = payload.trim();
  if (!trimmed) return { kind: "ignore" };
  if (trimmed.startsWith(":")) return { kind: "ignore" }; // SSE comment
  if (trimmed === "[DONE]") return { kind: "done" };

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (
      typeof parsed.error === "string" ||
      (parsed.error !== undefined && typeof parsed.error === "object")
    ) {
      const err = parsed.error as { message?: unknown; code?: unknown };
      return {
        kind: "error",
        error: {
          message:
            typeof err.message === "string"
              ? err.message
              : "Stream returned an error.",
          code: typeof err.code === "string" ? err.code : undefined,
        },
      };
    }
    // Normal chunk: coerce into the ChatStreamChunk shape.
    const chunk: ChatStreamChunk = {
      delta: typeof parsed.delta === "string" ? parsed.delta : "",
      finish_reason:
        typeof parsed.finish_reason === "string"
          ? (parsed.finish_reason as ChatStreamChunk["finish_reason"])
          : undefined,
      usage:
        parsed.usage && typeof parsed.usage === "object"
          ? (parsed.usage as TokenUsage)
          : undefined,
    };
    return { kind: "chunk", chunk };
  } catch {
    // Defensive: if JSON.parse fails, treat the raw payload as a delta.
    return { kind: "chunk", chunk: { delta: trimmed } };
  }
}

/**
 * Split a raw SSE byte-stream buffer into discrete `data:` payloads.
 *
 * The buffer is appended to as new chunks arrive; this function splits
 * on `\n\n` (frame boundary) and returns `[frames, remainder]` so the
 * caller can keep the un-terminated tail for the next read.
 *
 * Each returned frame is the payload **after** the `data: ` prefix
 * (with a single leading space stripped if present).
 */
function splitSseBuffer(buffer: string): {
  frames: string[];
  remainder: string;
} {
  const frames: string[] = [];
  let cursor = 0;
  for (;;) {
    const idx = buffer.indexOf("\n\n", cursor);
    if (idx === -1) break;
    const rawFrame = buffer.slice(cursor, idx);
    cursor = idx + 2;
    // A frame may contain multiple lines (e.g. `event:` + `data:`).
    // We only care about `data:` lines — concatenate them.
    const dataLines: string[] = [];
    for (const line of rawFrame.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5));
      }
    }
    if (dataLines.length > 0) {
      frames.push(dataLines.join("\n"));
    }
  }
  return { frames, remainder: buffer.slice(cursor) };
}

/**
 * Consume a `Response.body` ReadableStream of SSE-encoded bytes and
 * invoke `onFrame` for each parsed `data:` payload. Returns when the
 * stream closes or the abort signal fires.
 */
async function consumeSseStream(
  body: ReadableStream<Uint8Array> | null,
  onFrame: (payload: string) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (signal.aborted) {
        // Best-effort cancel — the underlying stream may already be
        // closed; ignore the rejection.
        await reader.cancel().catch(() => {});
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = splitSseBuffer(buffer);
      buffer = remainder;
      for (const frame of frames) {
        onFrame(frame);
      }
    }
    // Flush any trailing frame (servers don't always emit a final `\n\n`).
    const tail = buffer.trim();
    if (tail) onFrame(tail);
  } finally {
    reader.releaseLock();
  }
}

/**
 * The chat streaming hook. Mounted once at the top of the chat view;
 * `sendMessage` / `regenerate` / `stopGeneration` are passed down to
 * the composer + message bubbles via props.
 */
export function useChatStream(): UseChatStreamResult {
  const qc = useQueryClient();
  const abortRef = React.useRef<AbortController | null>(null);

  // Pull shared UI state setters from the Zustand store. We only
  // subscribe to the readers we need (selection of fields keeps
  // re-renders narrow).
  const isGenerating = useChatStore((s) => s.isGenerating);
  const partialMessage = useChatStore((s) => s.partialMessage);
  const setGenerating = useChatStore((s) => s.setGenerating);
  const setPartialMessage = useChatStore((s) => s.setPartialMessage);

  /**
   * Issue a streaming POST and accumulate the response. Shared by
   * `sendMessage` (POST `/api/chat/conversations/:id/stream`) and
   * `regenerate` (POST `/api/chat/messages/:id/regenerate`).
   */
  const streamRequest = React.useCallback(
    async (
      url: string,
      body: unknown,
      conversationId: string,
    ): Promise<StreamResult> => {
      // Abort any prior stream — only one stream is allowed at a time.
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setGenerating(true, { conversationId });
      setPartialMessage("");

      let accumulated = "";
      let finishReason: string | null = null;
      let usage: TokenUsage | null = null;
      let streamError: { message: string; code?: string } | null = null;

      try {
        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Non-2xx — the server may have rejected the request before
          // starting the stream (rate limit, validation, payment
          // required, etc.). Try to parse the canonical error envelope.
          let message = `Request failed (${res.status}).`;
          try {
            const json = (await res.json()) as {
              success?: boolean;
              error?: { message?: string; code?: string };
            };
            if (json.error?.message) {
              message = json.error.message;
              streamError = { message, code: json.error.code };
            }
          } catch {
            // Ignore — fall back to the generic message.
          }
          if (!streamError) {
            streamError = { message };
          }
          throw streamError;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          // The server returned 200 but with a non-SSE body — likely a
          // JSON error envelope from a guard that didn't switch the
          // response type. Parse it as such.
          try {
            const json = (await res.json()) as {
              success?: boolean;
              error?: { message?: string; code?: string };
            };
            if (json.error?.message) {
              throw {
                message: json.error.message,
                code: json.error.code,
              } as ChatApiError;
            }
          } catch (e) {
            if (e && typeof e === "object" && "message" in e) throw e;
          }
          throw {
            message: "Expected an event-stream response.",
          } as ChatApiError;
        }

        await consumeSseStream(
          res.body,
          (payload) => {
            const frame = parseSsePayload(payload);
            switch (frame.kind) {
              case "ignore":
                return;
              case "done":
                return;
              case "error":
                streamError = frame.error;
                return;
              case "chunk": {
                if (frame.chunk.delta) {
                  accumulated += frame.chunk.delta;
                  setPartialMessage(accumulated);
                }
                if (frame.chunk.finish_reason) {
                  finishReason = frame.chunk.finish_reason;
                }
                if (frame.chunk.usage) {
                  usage = frame.chunk.usage;
                }
                return;
              }
            }
          },
          controller.signal,
        );

        if (streamError) {
          throw streamError;
        }

        const result: StreamResult = {
          content: accumulated,
          finishReason,
          usage,
        };
        return result;
      } catch (err) {
        // AbortError — the user clicked "Stop". Treat as a clean stop
        // (the partial message remains in the store until the next
        // send resets it).
        if (
          err instanceof DOMException &&
          err.name === "AbortError"
        ) {
          const result: StreamResult = {
            content: accumulated,
            finishReason: "stopped",
            usage: null,
          };
          return result;
        }
        // Re-throw everything else as a ChatApiError.
        if (err && typeof err === "object" && "message" in err) {
          throw err as ChatApiError;
        }
        throw {
          message:
            err instanceof Error ? err.message : "Stream failed unexpectedly.",
        } as ChatApiError;
      } finally {
        // Always clear the streaming state + invalidate the messages
        // query so the persisted assistant message (saved server-side
        // after `[DONE]`) replaces the in-flight partial in the UI.
        abortRef.current = null;
        setGenerating(false);
        setPartialMessage(null);
        qc.invalidateQueries({
          queryKey: chatKeys.messages(conversationId),
        });
        qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
        qc.invalidateQueries({ queryKey: chatKeys.usage });
      }
    },
    [qc, setGenerating, setPartialMessage],
  );

  const sendMessage = React.useCallback(
    (conversationId: string, input: SendMessageInput) =>
      streamRequest(
        `/api/chat/conversations/${conversationId}/stream`,
        { ...input, conversationId },
        conversationId,
      ),
    [streamRequest],
  );

  const regenerate = React.useCallback(
    (
      messageId: string,
      conversationId: string,
      input: RegenerateInput = {},
    ) =>
      streamRequest(
        `/api/chat/messages/${messageId}/regenerate`,
        { ...input, messageId },
        conversationId,
      ),
    [streamRequest],
  );

  const stopGeneration = React.useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // Abort any in-flight stream when the component unmounts.
  React.useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  return {
    isGenerating,
    partialMessage,
    sendMessage,
    regenerate,
    stopGeneration,
  };
}
