"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PanelLeftClose, PanelLeft, Copy, Check, Square, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatInput } from "./chat-input";
import { ModelSelector } from "./model-selector";
import { ErrorMessage } from "./error-message";
import { useStreamingChat } from "@/lib/chat/use-streaming-chat";
import { updateConversationModel } from "@/services/chat/actions";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/services/chat";

interface ChatWindowProps {
  conversationId: string;
  initialMessages: Message[];
  modelId: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function ChatWindow({
  conversationId,
  initialMessages,
  modelId: initialModelId,
  sidebarOpen,
  onToggleSidebar,
}: ChatWindowProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [activeModel, setActiveModel] = useState(initialModelId);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { state: streamState, startStream, stopStream } = useStreamingChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamState.streamedContent]);

  const handleSend = useCallback(
    async (content: string) => {
      // Optimistic user message
      const optimisticUserMsg: Message = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        role: "user",
        content,
        provider: null,
        model: null,
        input_tokens: 0,
        output_tokens: 0,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);

      // Try streaming first
      const msgId = await startStream(conversationId, content, activeModel);

      if (streamState.error && !streamState.streamedContent) {
        // Streaming failed entirely, remove optimistic and show error
        setMessages((prev) =>
          prev.filter((m) => m.id !== optimisticUserMsg.id)
        );
        return;
      }

      // Stream succeeded (or partially) — add assistant message
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== optimisticUserMsg.id);
        const realUserMsg: Message = {
          id: `user-${Date.now()}`,
          conversation_id: conversationId,
          role: "user",
          content,
          provider: null,
          model: null,
          input_tokens: 0,
          output_tokens: 0,
          created_at: new Date().toISOString(),
        };
        const assistantMsg: Message = {
          id: msgId ?? `assistant-${Date.now()}`,
          conversation_id: conversationId,
          role: "assistant",
          content: streamState.streamedContent,
          provider: null,
          model: null,
          input_tokens: 0,
          output_tokens: 0,
          created_at: new Date().toISOString(),
        };
        return [...filtered, realUserMsg, assistantMsg];
      });

      router.refresh();
    },
    [conversationId, activeModel, startStream, streamState.error, streamState.streamedContent, router]
  );

  const handleCopy = useCallback(async (content: string, messageId: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleRegenerate = useCallback(async () => {
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    // Remove the last assistant message
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") return prev.slice(0, -1);
      return prev;
    });

    await startStream(conversationId, lastUserMsg.content, activeModel);
    if (streamState.streamedContent) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          conversation_id: conversationId,
          role: "assistant" as const,
          content: streamState.streamedContent,
          provider: null,
          model: null,
          input_tokens: 0,
          output_tokens: 0,
          created_at: new Date().toISOString(),
        },
      ]);
    }
    router.refresh();
  }, [messages, conversationId, activeModel, startStream, streamState.streamedContent, router]);

  const handleModelChange = useCallback(
    async (newModelId: string) => {
      setActiveModel(newModelId);
      await updateConversationModel(conversationId, newModelId);
    },
    [conversationId]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onToggleSidebar}>
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push("/chat")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector value={activeModel} onValueChange={handleModelChange} />
          {streamState.isStreaming && (
            <Button variant="destructive" size="icon" onClick={stopStream} title="Stop generation">
              <Square className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-4">
          {messages.length === 0 && !streamState.isStreaming && <EmptyState />}
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          ))}
          {streamState.isStreaming && streamState.streamedContent && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[80%] rounded-lg bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {streamState.streamedContent}
                  </Markdown>
                </div>
                <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/60" />
              </div>
            </div>
          )}
          {streamState.isStreaming && !streamState.streamedContent && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bot className="h-4 w-4 animate-pulse" />
              </div>
              <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                Thinking...
              </div>
            </div>
          )}
          {streamState.error && !streamState.isStreaming && (
            <ErrorMessage
              message={streamState.error}
              onRetry={() => handleRegenerate()}
            />
          )}
        </div>
      </div>

      <ChatInput onSend={handleSend} disabled={streamState.isStreaming} />
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  copiedId: string | null;
  onCopy: (content: string, messageId: string) => void;
}

function MessageBubble({ message, copiedId, onCopy }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isCopied = copiedId === message.id;

  return (
    <div className={isUser ? "flex flex-row-reverse gap-3" : "flex gap-3"}>
      <div
        className={
          isUser
            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        }
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={isUser ? "max-w-[80%]" : "max-w-[80%]"}>
        <div
          className={
            isUser
              ? "rounded-lg bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground"
              : "rounded-lg bg-muted px-4 py-3 text-sm leading-relaxed text-foreground"
          }
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </Markdown>
            </div>
          )}
        </div>
        <div className={isUser ? "mt-1 flex items-center justify-end gap-1" : "mt-1 flex items-center gap-1"}>
          <span className="text-xs opacity-60">
            {new Date(message.created_at).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          {!isUser && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onCopy(message.content, message.id)}
              title="Copy"
            >
              {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-2xl">
        <Bot className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-medium">Start a conversation</h3>
      <p className="text-muted-foreground mt-1 text-center text-sm">
        Send a message to begin chatting with the AI assistant.
      </p>
    </div>
  );
}
