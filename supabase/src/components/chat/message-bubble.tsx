"use client";

/**
 * Supa AI — Chat message bubble (Phase 3).
 *
 * Renders a single message in a conversation:
 *
 *   - **User messages** — right-aligned, brand-tinted background, plain
 *     text (preserves whitespace + line breaks but doesn't render
 *     markdown — user input is treated as text, not markup).
 *   - **Assistant messages** — left-aligned, card background, rendered
 *     through {@link MarkdownRenderer} (markdown + syntax-highlighted
 *     code blocks). A small footer shows the provider + model badge
 *     plus token usage / cost / latency when available.
 *   - **Error messages** — assistant messages with
 *     `finish_reason === 'error'` render as a red-bordered card with
 *     the error message + a Retry button (re-runs the parent message).
 *
 * Hover actions (top-right of each bubble):
 *   - **Copy** — copies the raw message content to the clipboard.
 *   - **Edit** (user messages only) — opens an inline editor; saving
 *     PATCHes the message and (optionally) re-runs the conversation.
 *   - **Regenerate** (assistant messages only) — calls
 *     `useChatStream.regenerate` to re-run from this message's parent.
 *   - **Delete** — removes the message (with a confirm dialog).
 *
 * The bubble is fully keyboard-accessible: every action button has an
 * `aria-label`, the bubble itself has a `role="article"` + an
 * `aria-label` describing the role + timestamp, and the inline editor
 * saves on `Cmd/Ctrl+Enter` and cancels on `Escape`.
 *
 * @module @/components/chat/message-bubble
 */
import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils/index";
import type { Message } from "@/lib/chat/message-service";
import type { StreamResult } from "@/hooks/use-chat-stream";
import {
  useDeleteMessage,
  useEditMessage,
  type ChatApiError,
} from "@/hooks/use-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { MarkdownRenderer } from "./markdown-renderer";

/** Provider labels for the badge under assistant messages. */
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  grok: "Grok",
};

/** Props accepted by {@link MessageBubble}. */
export interface MessageBubbleProps {
  /** The message row to render. */
  message: Message;
  /** Trigger a regenerate from this assistant message's parent. */
  onRegenerate: (messageId: string) => Promise<StreamResult>;
  /** Whether a regenerate / send is currently in flight for this
   * conversation. Disables the regenerate button. */
  isGenerating: boolean;
}

/** Format a cost-in-cents value as a USD string. */
function formatCost(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "$0.000";
  const usd = cents / 100;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

/** Format a latency in ms as a human-friendly string. */
function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Copy text to the clipboard + toast the result. */
async function copyMessageContent(text: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Couldn't copy to clipboard");
  }
}

/** Pull the string content out of the Json `content` column. */
function readContent(message: Message): string {
  if (typeof message.content === "string") return message.content;
  if (message.content == null) return "";
  try {
    return String(message.content);
  } catch {
    return "";
  }
}

/** A single assistant message bubble. */
function AssistantBubble({
  message,
  onRegenerate,
  isGenerating,
}: MessageBubbleProps) {
  const content = readContent(message);
  const isError = message.finish_reason === "error";
  const providerLabel = message.provider
    ? PROVIDER_LABELS[message.provider] ?? message.provider
    : null;
  const modelLabel = message.model ?? null;

  const handleRegenerate = React.useCallback(() => {
    if (isGenerating) return;
    onRegenerate(message.id).catch((err: ChatApiError) => {
      toast.error(err.message ?? "Regenerate failed.");
    });
  }, [isGenerating, message.id, onRegenerate]);

  const usage = React.useMemo(() => {
    const parts: string[] = [];
    if (message.total_tokens != null && message.total_tokens > 0) {
      parts.push(`${message.total_tokens} tokens`);
    }
    if (message.cost_cents != null && message.cost_cents > 0) {
      parts.push(formatCost(message.cost_cents));
    }
    if (message.latency_ms != null && message.latency_ms > 0) {
      parts.push(formatLatency(message.latency_ms));
    }
    if (modelLabel) parts.push(modelLabel);
    return parts.join(" · ");
  }, [
    message.total_tokens,
    message.cost_cents,
    message.latency_ms,
    modelLabel,
  ]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group/msg flex w-full flex-col gap-1",
        "items-start",
      )}
      aria-label={`Assistant message from ${providerLabel ?? "AI"} at ${formatRelativeTime(message.created_at)}`}
      role="article"
    >
      <div className="flex w-full items-start gap-3">
        <Avatar provider={message.provider} />
        <div
          className={cn(
            "relative max-w-[85%] rounded-2xl rounded-tl-sm border px-4 py-3 shadow-xs sm:max-w-[75%]",
            isError
              ? "border-destructive/40 bg-destructive/5"
              : "border-border bg-card",
          )}
        >
          {isError ? (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-medium">Generation failed</p>
                <p className="text-muted-foreground">
                  {message.error_message || "The provider returned an error."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="mt-2 h-7 gap-1.5 text-xs"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <MarkdownRenderer content={content} />
          )}

          {/* Hover actions */}
          <div
            className="absolute -right-1 -top-3 flex items-center gap-1 rounded-md border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100"
            role="group"
            aria-label="Message actions"
          >
            <ActionIconButton
              label="Copy message"
              onClick={() => copyMessageContent(content)}
            >
              <Copy className="size-3.5" aria-hidden="true" />
            </ActionIconButton>
            {!isError && (
              <ActionIconButton
                label="Regenerate response"
                onClick={handleRegenerate}
                disabled={isGenerating}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
              </ActionIconButton>
            )}
          </div>
        </div>
      </div>

      {/* Footer: provider badge + usage stats. */}
      <div className="ml-9 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {providerLabel && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            {providerLabel}
          </Badge>
        )}
        {usage && <span className="text-[11px]">{usage}</span>}
      </div>
    </motion.article>
  );
}

/** A single user message bubble (right-aligned, brand-tinted). */
function UserBubble({
  message,
  conversationId,
  isGenerating,
}: {
  message: Message;
  conversationId: string;
  isGenerating: boolean;
}) {
  const content = readContent(message);
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(content);
  const editMutation = useEditMessage(conversationId);
  const deleteMutation = useDeleteMessage(conversationId);

  React.useEffect(() => {
    if (!isEditing) setDraft(content);
  }, [content, isEditing]);

  const handleSave = React.useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error("Message can't be empty.");
      return;
    }
    if (trimmed === content) {
      setIsEditing(false);
      return;
    }
    editMutation.mutate(
      { id: message.id, input: { content: trimmed } },
      {
        onSuccess: () => {
          setIsEditing(false);
          toast.success("Message updated.");
        },
        onError: (err: ChatApiError) => {
          toast.error(err.message ?? "Couldn't save edit.");
        },
      },
    );
  }, [content, draft, editMutation, message.id]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDraft(content);
        setIsEditing(false);
      }
    },
    [content, handleSave],
  );

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="group/msg flex w-full flex-col items-end gap-1"
      aria-label={`Your message at ${formatRelativeTime(message.created_at)}`}
      role="article"
    >
      <div className="flex w-full items-start justify-end gap-3">
        <div className="relative max-w-[85%] rounded-2xl rounded-tr-sm border border-brand/30 bg-brand/10 px-4 py-3 shadow-xs sm:max-w-[75%]">
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={Math.min(8, Math.max(2, draft.split("\n").length))}
                className="min-h-16 bg-background text-sm"
                aria-label="Edit message"
                autoFocus
                disabled={editMutation.isPending}
              />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(content);
                    setIsEditing(false);
                  }}
                  disabled={editMutation.isPending}
                  className="h-7 gap-1.5 text-xs"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={editMutation.isPending}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {content}
            </p>
          )}

          {/* Hover actions */}
          {!isEditing && (
            <div
              className="absolute -left-1 -top-3 flex items-center gap-1 rounded-md border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100"
              role="group"
              aria-label="Message actions"
            >
              <ActionIconButton
                label="Copy message"
                onClick={() => copyMessageContent(content)}
              >
                <Copy className="size-3.5" aria-hidden="true" />
              </ActionIconButton>
              <ActionIconButton
                label="Edit message"
                onClick={() => setIsEditing(true)}
                disabled={isGenerating}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </ActionIconButton>
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <ActionIconButton
                        label="Delete message"
                        onClick={() => undefined}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </ActionIconButton>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Delete message</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this message?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The message will be permanently removed from this
                      conversation. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        deleteMutation.mutate(message.id, {
                          onSuccess: () => toast.success("Message deleted."),
                          onError: (err: ChatApiError) =>
                            toast.error(err.message ?? "Delete failed."),
                        })
                      }
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </div>
      <span className="mr-1 text-[11px] text-muted-foreground">
        {formatRelativeTime(message.created_at)}
      </span>
    </motion.article>
  );
}

/** A tiny circular avatar with the provider's initial. */
function Avatar({ provider }: { provider: string | null }) {
  const initial = provider ? provider.charAt(0).toUpperCase() : "A";
  return (
    <div
      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground"
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

/** A small icon button used in the hover-action toolbar. */
function ActionIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className="size-6"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Public component — dispatches to {@link UserBubble} or {@link AssistantBubble}. */
export function MessageBubble({
  message,
  onRegenerate,
  isGenerating,
  conversationId,
}: MessageBubbleProps & { conversationId: string }) {
  if (message.role === "user") {
    return (
      <UserBubble
        message={message}
        conversationId={conversationId}
        isGenerating={isGenerating}
      />
    );
  }
  if (message.role === "assistant") {
    return (
      <AssistantBubble
        message={message}
        onRegenerate={onRegenerate}
        isGenerating={isGenerating}
      />
    );
  }
  // System / tool messages are not rendered in the chat UI — they're
  // internal to the AI call. Return null so they don't take up space.
  return null;
}
