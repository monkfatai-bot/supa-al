"use client";

/**
 * Supa AI — Phase 10 Business AI Suite — AI assistant view.
 *
 * A simple chat-style interface for asking business questions to the
 * AI assistant. The conversation is ephemeral — messages live only in
 * component state (the API is stateless; each turn re-sends the
 * question + a small snapshot of the workspace).
 *
 * Composes:
 *
 *   - A scrollable message list (user + assistant turns).
 *   - A question composer (textarea + send button).
 *   - Suggested prompt chips that auto-fill the composer.
 *
 * The view is purely presentational on top of {@link useBusinessAI}
 * from {@link @/hooks/use-business}.
 *
 * @module @/components/business/ai-assistant-view
 */
import * as React from "react";
import {
  Bot,
  CornerDownLeft,
  Sparkles,
  User as UserIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { BusinessAiAnswer } from "@/lib/business/client";
import { useBusinessAI } from "@/hooks/use-business";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  context?: BusinessAiAnswer["context"];
}

const SUGGESTIONS = [
  "How is my revenue trending this quarter?",
  "Which customers have overdue invoices?",
  "Summarize my open pipeline.",
  "What's my net profit this month?",
  "List my top 3 customers by revenue.",
];

export interface AiAssistantViewProps {
  workspaceId: string;
  className?: string;
}

export function AiAssistantView({
  workspaceId,
  className,
}: AiAssistantViewProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const mutation = useBusinessAI();
  const { toast } = useToast();

  // Auto-scroll to the bottom when messages change.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const submit = React.useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || mutation.isPending) return;
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setDraft("");
      try {
        const result = await mutation.mutateAsync({
          workspaceId,
          question: trimmed,
        });
        const aiMsg: Message = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.answer,
          context: result.context,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (err) {
        toast({
          title: "Assistant failed",
          description:
            err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [mutation, toast, workspaceId],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(draft);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        className,
      )}
    >
      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Business AI Assistant</h2>
            <p className="text-xs text-muted-foreground">
              Ask questions about your revenue, customers, pipeline, and invoices.
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
              <Bot className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Ask me anything about your business</p>
              <p className="mt-1 text-xs text-muted-foreground">
                I have read-only access to your workspace's CRM, invoices, pipeline, and projects.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  onClick={() => void submit(s)}
                  disabled={mutation.isPending}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {mutation.isPending ? (
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="size-4" aria-hidden="true" />
            </span>
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t bg-background/95 p-3 backdrop-blur">
        <div className="relative">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a business question…"
            rows={2}
            className="resize-none pr-12"
            disabled={mutation.isPending}
          />
          <Button
            type="button"
            size="icon"
            className="absolute bottom-2 right-2 size-8"
            onClick={() => void submit(draft)}
            disabled={!draft.trim() || mutation.isPending}
            aria-label="Send"
          >
            <CornerDownLeft className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
          Press Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        isUser ? "flex-row-reverse" : "",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        {isUser ? (
          <UserIcon className="size-4" aria-hidden="true" />
        ) : (
          <Bot className="size-4" aria-hidden="true" />
        )}
      </span>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {message.context ? (
          <div className="mt-2 grid grid-cols-2 gap-1 border-t border-current/20 pt-2 text-[10px] opacity-80 sm:grid-cols-3">
            <ContextChip label="Customers" value={String(message.context.customerCount)} />
            <ContextChip label="Leads" value={String(message.context.leadCount)} />
            <ContextChip label="Opps" value={String(message.context.opportunityCount)} />
            <ContextChip label="Invoices" value={String(message.context.invoiceCount)} />
            <ContextChip
              label="Mo revenue"
              value={message.context.monthRevenue.toLocaleString()}
            />
            <ContextChip
              label="Mo expenses"
              value={message.context.monthExpenses.toLocaleString()}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-current/10 px-1.5 py-0.5">
      <span className="opacity-70">{label}:</span> <span className="font-medium">{value}</span>
    </div>
  );
}
