"use client";

/**
 * Supa AI — Chat message list (Phase 3).
 *
 * Renders the scrollable list of messages for the active conversation:
 *
 *   - Backed by the `useMessages` infinite query (paginated by
 *     `offset`). Pages are loaded on scroll-up via
 *     `fetchNextPage` when the user is near the top.
 *   - Auto-scrolls to the bottom on new messages — BUT only when the
 *     user is already near the bottom (so we don't yank them away from
 *     history they're reading).
 *   - Renders the in-flight streaming partial (from
 *     `useChatStore.partialMessage`) as a final assistant bubble with
 *     a blinking typing cursor when a stream is active for this
 *     conversation.
 *   - Loading skeletons when the first page is fetching.
 *
 * @module @/components/chat/message-list
 */
import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { Message } from "@/lib/chat/message-service";
import type { StreamResult } from "@/hooks/use-chat-stream";
import {
  flattenMessagePages,
  useMessages,
} from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chat-store";
import { Skeleton } from "@/components/ui/skeleton";

import { MessageBubble } from "./message-bubble";
import { MarkdownRenderer } from "./markdown-renderer";

/** Distance from the bottom (px) under which auto-scroll is allowed. */
const AUTO_SCROLL_THRESHOLD_PX = 120;

/** Props accepted by {@link MessageList}. */
export interface MessageListProps {
  /** The active conversation id. */
  conversationId: string;
  /** Trigger a regenerate from a given assistant message id. */
  onRegenerate: (messageId: string) => Promise<StreamResult>;
}

/** A typing-cursor bubble shown when a stream is in flight. */
function StreamingBubble({ partial }: { partial: string }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex w-full flex-col items-start gap-1"
      aria-label="Assistant is typing"
      role="article"
    >
      <div className="flex w-full items-start gap-3">
        <div
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground"
          aria-hidden="true"
        >
          A
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 shadow-xs sm:max-w-[75%]">
          {partial ? (
            <MarkdownRenderer content={partial} />
          ) : (
            <div className="flex items-center gap-1.5 py-1">
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground" />
              <span className="sr-only">Generating response…</span>
            </div>
          )}
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-brand align-middle"
          />
        </div>
      </div>
    </motion.article>
  );
}

/** Loading skeleton for the initial messages fetch. */
function MessagesSkeleton() {
  return (
    <div className="space-y-6 px-4 py-6" aria-label="Loading messages">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            "flex w-full",
            i % 2 === 0 ? "justify-start" : "justify-end",
          )}
        >
          <div className="max-w-[75%] space-y-2">
            <Skeleton className="h-16 w-64 rounded-2xl" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The message list. Owns the scroll container, auto-scroll behavior,
 * and "load more on scroll-up" pagination.
 */
export function MessageList({
  conversationId,
  onRegenerate,
}: MessageListProps) {
  const query = useMessages(conversationId);
  const messages = React.useMemo(
    () => flattenMessagePages(query.data),
    [query.data],
  );

  const isGenerating = useChatStore((s) => s.isGenerating);
  const streamingConversationId = useChatStore(
    (s) => s.streamingConversationId,
  );
  const partialMessage = useChatStore((s) => s.partialMessage);
  const showStreaming =
    isGenerating && streamingConversationId === conversationId;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = React.useRef(true);

  // Track whether the user is near the bottom. We update the ref on
  // scroll so the auto-scroll effect can decide whether to jump.
  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current =
      distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
  }, []);

  // Auto-scroll to the bottom when:
  //   - new messages arrive, OR
  //   - the streaming partial updates, OR
  //   - generation starts/stops
  // — but ONLY if the user is already near the bottom (we don't yank
  // them away from history they're reading).
  React.useEffect(() => {
    if (!stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, partialMessage, isGenerating, conversationId]);

  // Always jump to the bottom when switching conversations — the
  // user expects the latest message to be visible.
  React.useEffect(() => {
    stickToBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversationId]);

  // Load more on scroll-up: when the user is within 200px of the top
  // AND there's a next page, fetch it.
  const handleLoadMore = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop <= 200 && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  // Combine scroll + load-more handlers (the scroll-area viewport
  // emits the native scroll event).
  const onScroll = React.useCallback(() => {
    handleScroll();
    handleLoadMore();
  }, [handleScroll, handleLoadMore]);

  if (query.isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <MessagesSkeleton />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-destructive">
          Couldn't load messages
        </p>
        <p className="text-xs text-muted-foreground">
          {query.error instanceof Error
            ? query.error.message
            : "Please try again in a moment."}
        </p>
      </div>
    );
  }

  if (messages.length === 0 && !showStreaming) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">No messages yet</p>
        <p className="text-xs text-muted-foreground">
          Send a message below to start the conversation.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="scrollbar-thin flex-1 overflow-y-auto"
      role="log"
      aria-live="polite"
      aria-label="Conversation messages"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        {query.isFetchingNextPage && (
          <div className="flex justify-center">
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
        )}
        {messages.map((m: Message) => (
          <MessageBubble
            key={m.id}
            message={m}
            conversationId={conversationId}
            onRegenerate={onRegenerate}
            isGenerating={isGenerating}
          />
        ))}
        {showStreaming && (
          <StreamingBubble partial={partialMessage ?? ""} />
        )}
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </div>
  );
}
