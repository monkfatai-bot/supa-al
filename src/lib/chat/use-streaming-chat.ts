"use client";

import { useState, useCallback, useRef } from "react";

interface StreamingState {
  isStreaming: boolean;
  streamedContent: string;
  error: string | null;
}

interface UseStreamingChatReturn {
  state: StreamingState;
  startStream: (
    conversationId: string,
    message: string,
    modelId?: string
  ) => Promise<string | null>; // returns the assistant message ID
  stopStream: () => void;
  reset: () => void;
}

export function useStreamingChat(): UseStreamingChatReturn {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    streamedContent: "",
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  const reset = useCallback(() => {
    stopStream();
    setState({ isStreaming: false, streamedContent: "", error: null });
  }, [stopStream]);

  const startStream = useCallback(
    async (conversationId: string, message: string, modelId?: string): Promise<string | null> => {
      stopStream();

      const controller = new AbortController();
      abortRef.current = controller;

      setState({ isStreaming: true, streamedContent: "", error: null });

      let fullContent = "";
      let messageId: string | null = null;

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, message, model: modelId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = (await response.json().catch(() => ({}))) as { error?: string };
          const errMsg = errData.error ?? `Request failed (${response.status})`;
          setState({ isStreaming: false, streamedContent: "", error: errMsg });
          return null;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setState({ isStreaming: false, streamedContent: "", error: "No response stream" });
          return null;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data: ")) continue;

            try {
              const parsed = JSON.parse(line.slice(6)) as {
                content?: string;
                done?: boolean;
                error?: string;
                messageId?: string;
                conversationTitle?: string;
                usage?: unknown;
              };

              if (parsed.error) {
                setState({ isStreaming: false, streamedContent: "", error: parsed.error });
                return null;
              }

              if (parsed.content) {
                fullContent += parsed.content;
                setState((prev) => ({
                  ...prev,
                  streamedContent: fullContent,
                }));
              }

              if (parsed.done) {
                messageId = parsed.messageId ?? null;
                void parsed.conversationTitle;
              }
            } catch {
              // Skip malformed SSE data
            }
          }
        }

        setState({ isStreaming: false, streamedContent: fullContent, error: null });
        return messageId;
      } catch (err) {
        if (controller.signal.aborted) {
          setState({ isStreaming: false, streamedContent: fullContent, error: null });
          return null;
        }
        const errMsg = err instanceof Error ? err.message : "Stream failed";
        setState({ isStreaming: false, streamedContent: "", error: errMsg });
        return null;
      } finally {
        abortRef.current = null;
      }
    },
    [stopStream]
  );

  return { state, startStream, stopStream, reset };
}
