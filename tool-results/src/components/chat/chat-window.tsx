"use client";

/**
 * Supa AI — Chat window (Phase 3).
 *
 * The main chat area: header (conversation title + model badge +
 * actions menu), the scrollable {@link MessageList}, and the
 * {@link ChatComposer} at the bottom.
 *
 * When no conversation is active, the window renders a friendly empty
 * state with a few suggested prompt templates the user can click to
 * bootstrap a new conversation.
 *
 * @module @/components/chat/chat-window
 */
import * as React from "react";
import { motion } from "framer-motion";
import {
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { StreamResult } from "@/hooks/use-chat-stream";
import {
  useConversation,
  usePromptTemplates,
  useUpdateConversation,
  type ChatApiError,
  type PromptTemplate,
} from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chat-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import { ChatComposer } from "./chat-composer";
import { MessageList } from "./message-list";

/** Props accepted by {@link ChatWindow}. */
export interface ChatWindowProps {
  /** The active conversation id. When `null`, the empty state is shown. */
  conversationId: string | null;
  /** Send a message via the parent (which routes through
   * `useChatStream.sendMessage` + may create a conversation first). */
  onSend: (content: string, attachmentIds: string[]) => Promise<StreamResult>;
  /** Regenerate from a given assistant message id. */
  onRegenerate: (messageId: string) => Promise<StreamResult>;
  /** Stop the in-flight stream. */
  onStop: () => void;
  /** Whether a stream is currently in flight. */
  isGenerating: boolean;
  /** Open the mobile sidebar Sheet. */
  onOpenSidebar: () => void;
  /** Insert a starter prompt into the composer (used by the empty
   * state's "suggested templates" cards). */
  onUseStarter: (content: string) => void;
}

/** The header — title (click to rename) + model badge + actions. */
function ChatHeader({
  conversationId,
  onOpenSidebar,
}: {
  conversationId: string;
  onOpenSidebar: () => void;
}) {
  const query = useConversation(conversationId);
  const updateMutation = useUpdateConversation();
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");

  React.useEffect(() => {
    if (!renaming) setRenameValue(query.data?.title ?? "");
  }, [query.data?.title, renaming]);

  const handleRename = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = renameValue.trim();
      if (!trimmed) {
        toast.error("Title can't be empty.");
        return;
      }
      updateMutation.mutate(
        { id: conversationId, input: { title: trimmed } },
        {
          onSuccess: () => {
            setRenaming(false);
            toast.success("Renamed.");
          },
          onError: (err: ChatApiError) =>
            toast.error(err.message ?? "Rename failed."),
        },
      );
    },
    [conversationId, renameValue, updateMutation],
  );

  const modelBadge = React.useMemo(() => {
    const provider = query.data?.provider;
    const model = query.data?.model;
    if (!provider && !model) return null;
    return `${provider ?? ""}${provider && model ? " · " : ""}${model ?? ""}`.trim();
  }, [query.data?.provider, query.data?.model]);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      {/* Mobile sidebar toggle */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 md:hidden"
        onClick={onOpenSidebar}
        aria-label="Open conversation list"
      >
        <MessageSquare className="size-4" aria-hidden="true" />
      </Button>

      {renaming ? (
        <form onSubmit={handleRename} className="flex flex-1 items-center gap-1.5">
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            disabled={updateMutation.isPending}
            className="h-8 max-w-md text-sm"
            aria-label="Conversation title"
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 text-xs"
            disabled={updateMutation.isPending}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setRenaming(false);
              setRenameValue(query.data?.title ?? "");
            }}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <h2
            className="truncate text-sm font-semibold text-foreground sm:text-base"
            title={query.data?.title ?? ""}
          >
            {query.isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              query.data?.title ?? "Untitled conversation"
            )}
          </h2>
          {modelBadge && (
            <Badge variant="outline" className="hidden h-5 px-1.5 text-[10px] sm:inline-flex">
              {modelBadge}
            </Badge>
          )}
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Conversation actions"
            disabled={renaming || updateMutation.isPending}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              setRenameValue(query.data?.title ?? "");
              setRenaming(true);
            }}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Rename
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

/** Suggested starter prompt (rendered in the empty state). */
function StarterCard({
  template,
  onUse,
}: {
  template: PromptTemplate;
  onUse: (content: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onUse(template.content)}
      className={cn(
        "group flex h-full w-full flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-left transition-all",
        "hover:border-brand/40 hover:shadow-sm",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Sparkles className="size-3.5" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-foreground">
          {template.title}
        </span>
      </div>
      {template.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {template.description}
        </p>
      )}
      <span className="mt-auto inline-flex items-center gap-1 text-[11px] text-brand opacity-0 transition-opacity group-hover:opacity-100">
        <Wand2 className="size-3" aria-hidden="true" />
        Use this prompt
      </span>
    </button>
  );
}

/** The empty state — shown when no conversation is active. */
function EmptyState({
  onUseStarter,
}: {
  onUseStarter: (content: string) => void;
}) {
  const templatesQuery = usePromptTemplates();
  const templates = (templatesQuery.data ?? []).slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col items-center justify-center gap-6 p-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Sparkles className="size-6" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold">Start a new conversation</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Ask anything, attach files for context, or pick a starter prompt
          below. Your conversations are saved automatically.
        </p>
      </div>

      {templates.length > 0 && (
        <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <StarterCard
              key={t.id}
              template={t}
              onUse={onUseStarter}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

/** The chat window — header + messages + composer (or empty state). */
export function ChatWindow({
  conversationId,
  onSend,
  onRegenerate,
  onStop,
  isGenerating,
  onOpenSidebar,
  onUseStarter,
}: ChatWindowProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {conversationId ? (
        <>
          <ChatHeader
            conversationId={conversationId}
            onOpenSidebar={onOpenSidebar}
          />
          <MessageList
            conversationId={conversationId}
            onRegenerate={onRegenerate}
          />
        </>
      ) : (
        <EmptyState onUseStarter={onUseStarter} />
      )}
      <ChatComposer
        conversationId={conversationId}
        onSend={onSend}
        onStop={onStop}
        isGenerating={isGenerating}
      />
    </div>
  );
}
