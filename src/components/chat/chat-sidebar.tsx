"use client";

/**
 * Supa AI — Chat sidebar (Phase 3).
 *
 * Conversation list + folders + new-chat button. Rendered as a
 * persistent panel on desktop and inside a `<Sheet>` on mobile
 * (controlled by `useChatStore.sidebarOpen`).
 *
 * Features:
 *
 *   - **New chat** button — creates a conversation via
 *     `useCreateConversation` + sets it active.
 *   - **Search** input — debounced (300ms); calls
 *     `useConversations({ search })`.
 *   - **Folder filter** — collapsible folder list from
 *     `useFolders`. Clicking a folder filters the conversations;
 *     an "All" chip clears the filter.
 *   - **Conversation list** — pinned first, then by
 *     `last_message_at desc`. Each row shows the title, last-message
 *     preview (truncated), relative time, and hover actions
 *     (pin / archive / "…"). Active conversation is highlighted.
 *   - **"…" menu** per conversation — Rename, Pin/Unpin, Archive,
 *     Move to folder, Delete (with confirm).
 *   - **Archived toggle** at the bottom — switches the list between
 *     active + archived conversations.
 *
 * @module @/components/chat/chat-sidebar
 */
import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  Folder as FolderIcon,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatRelativeTime, truncate } from "@/lib/utils/index";
import { useChatStore } from "@/stores/chat-store";
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useFolders,
  useUpdateConversation,
  type ChatApiError,
  type Folder,
} from "@/hooks/use-chat";
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
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Debounce a value by `delay` ms. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** A single conversation row. */
function ConversationRow({
  conversation,
  isActive,
  folders,
  onSelect,
}: {
  conversation: import("@/lib/chat/conversation-service").Conversation;
  isActive: boolean;
  folders: Folder[];
  onSelect: () => void;
}) {
  const updateMutation = useUpdateConversation();
  const deleteMutation = useDeleteConversation();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);

  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(
    conversation.title ?? "",
  );

  const handleSelect = React.useCallback(() => {
    setActiveConversation(conversation.id);
    toggleSidebar(false);
    onSelect();
  }, [conversation.id, onSelect, setActiveConversation, toggleSidebar]);

  const handleRename = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = renameValue.trim();
      if (!trimmed) {
        toast.error("Title can't be empty.");
        return;
      }
      updateMutation.mutate(
        { id: conversation.id, input: { title: trimmed } },
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
    [conversation.id, renameValue, updateMutation],
  );

  const handlePin = React.useCallback(
    () =>
      updateMutation.mutate(
        { id: conversation.id, input: { pinned: !conversation.pinned } },
        {
          onError: (err: ChatApiError) =>
            toast.error(err.message ?? "Couldn't update pin."),
        },
      ),
    [conversation.id, conversation.pinned, updateMutation],
  );

  const handleArchive = React.useCallback(
    () =>
      updateMutation.mutate(
        { id: conversation.id, input: { archived: !conversation.archived } },
        {
          onSuccess: () =>
            toast.success(
              conversation.archived ? "Unarchived." : "Archived.",
            ),
          onError: (err: ChatApiError) =>
            toast.error(err.message ?? "Couldn't archive."),
        },
      ),
    [conversation.archived, conversation.id, updateMutation],
  );

  const handleMove = React.useCallback(
    (folderId: string | null) =>
      updateMutation.mutate(
        { id: conversation.id, input: { folderId } },
        {
          onSuccess: () => toast.success("Moved."),
          onError: (err: ChatApiError) =>
            toast.error(err.message ?? "Move failed."),
        },
      ),
    [conversation.id, updateMutation],
  );

  const preview = conversation.last_message_preview ?? "No messages yet";

  return (
    <div
      className={cn(
        "group/conv relative flex flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-colors",
        "hover:bg-accent/50",
        isActive && "bg-brand/10 hover:bg-brand/15",
      )}
    >
      {renaming ? (
        <form onSubmit={handleRename} className="space-y-1.5">
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            disabled={updateMutation.isPending}
            className="h-7 text-sm"
            aria-label="Conversation title"
          />
          <div className="flex items-center gap-1.5">
            <Button
              type="submit"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={updateMutation.isPending}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setRenaming(false);
                setRenameValue(conversation.title ?? "");
              }}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleSelect}
          className="flex flex-col gap-0.5 text-left"
          aria-current={isActive ? "true" : undefined}
        >
          <div className="flex items-center gap-1">
            {conversation.pinned && (
              <Pin
                className="size-3 shrink-0 text-brand"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "flex-1 truncate text-sm font-medium",
                isActive ? "text-foreground" : "text-foreground/90",
              )}
            >
              {conversation.title ?? "Untitled conversation"}
            </span>
          </div>
          <span className="truncate text-[11px] text-muted-foreground">
            {truncate(preview, 60)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {conversation.last_message_at
              ? formatRelativeTime(conversation.last_message_at)
              : formatRelativeTime(conversation.created_at)}
            {conversation.message_count > 0 &&
              ` · ${conversation.message_count} msg`}
          </span>
        </button>
      )}

      {/* Hover + "…" menu */}
      {!renaming && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/conv:opacity-100 focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Conversation actions"
                disabled={updateMutation.isPending || deleteMutation.isPending}
              >
                <MoreHorizontal className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePin}>
                {conversation.pinned ? (
                  <>
                    <PinOff className="size-3.5" aria-hidden="true" />
                    Unpin
                  </>
                ) : (
                  <>
                    <Pin className="size-3.5" aria-hidden="true" />
                    Pin
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleArchive}>
                {conversation.archived ? (
                  <>
                    <ArchiveRestore className="size-3.5" aria-hidden="true" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="size-3.5" aria-hidden="true" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
              {folders.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderIcon
                      className="size-3.5"
                      aria-hidden="true"
                    />
                    Move to folder
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem onClick={() => handleMove(null)}>
                      No folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {folders.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        onClick={() => handleMove(f.id)}
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor: f.color ?? "var(--muted-foreground)",
                          }}
                          aria-hidden="true"
                        />
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    variant="destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete this conversation?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      <strong>{conversation.title ?? "This conversation"}</strong>{" "}
                      and all its messages will be permanently deleted. This
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() =>
                        deleteMutation.mutate(conversation.id, {
                          onSuccess: () => {
                            toast.success("Conversation deleted.");
                            // If we just deleted the active conversation,
                            // clear the selection.
                            if (isActive) setActiveConversation(null);
                          },
                          onError: (err: ChatApiError) =>
                            toast.error(err.message ?? "Delete failed."),
                        })
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

/** Loading skeleton for the conversation list. */
function ConversationsSkeleton() {
  return (
    <div className="space-y-1 px-1" aria-label="Loading conversations">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Empty state shown when no conversations match. */
function EmptyConversations({ archived }: { archived: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {archived ? (
          <Archive className="size-5" aria-hidden="true" />
        ) : (
          <Plus className="size-5" aria-hidden="true" />
        )}
      </span>
      <p className="text-sm font-medium">
        {archived ? "No archived conversations" : "No conversations yet"}
      </p>
      <p className="mx-auto max-w-xs text-xs text-muted-foreground">
        {archived
          ? "Archived conversations will appear here."
          : "Click \"New chat\" above to start your first conversation."}
      </p>
    </div>
  );
}

/** The sidebar's content (shared between desktop + mobile Sheet). */
export interface ChatSidebarProps {
  /** Optional callback when a conversation is selected (used by the
   * mobile sheet to auto-close). */
  onSelect?: () => void;
}

/** The sidebar — renders the same content on desktop and inside the
 * mobile Sheet (the parent decides which wrapper to use). */
export function ChatSidebar({ onSelect }: ChatSidebarProps) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const createMutation = useCreateConversation();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [archived, setArchived] = React.useState(false);
  const [folderFilter, setFolderFilter] = React.useState<string | null>(null);

  const conversationsQuery = useConversations({
    archived,
    folderId: folderFilter ?? undefined,
    search: debouncedSearch || undefined,
    limit: 50,
  });
  const foldersQuery = useFolders();
  const folders = foldersQuery.data ?? [];

  const handleNewChat = React.useCallback(() => {
    createMutation.mutate(
      {},
      {
        onSuccess: (conversation) => {
          setActiveConversation(conversation.id);
          onSelect?.();
        },
        onError: (err: ChatApiError) =>
          toast.error(err.message ?? "Couldn't create conversation."),
      },
    );
  }, [createMutation, onSelect, setActiveConversation]);

  return (
    <div className="flex h-full flex-col bg-sidebar/30">
      {/* Header — New chat + search */}
      <div className="space-y-2 border-b p-3">
        <Button
          type="button"
          className="w-full gap-1.5"
          onClick={handleNewChat}
          disabled={createMutation.isPending}
        >
          <Plus className="size-4" aria-hidden="true" />
          New chat
        </Button>
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Folders (collapsible) */}
      {folders.length > 0 && (
        <div className="border-b px-2 py-2">
          <Collapsible defaultOpen>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-1 py-0.5 text-left"
                aria-expanded="true"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <FolderIcon className="size-3" aria-hidden="true" />
                  Folders
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-0.5 pt-1">
                <button
                  type="button"
                  onClick={() => setFolderFilter(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
                    folderFilter === null
                      ? "bg-brand/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  <span
                    className="size-2 rounded-full bg-muted-foreground"
                    aria-hidden="true"
                  />
                  All conversations
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFolderFilter(f.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
                      folderFilter === f.id
                        ? "bg-brand/10 text-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor: f.color ?? "var(--muted-foreground)",
                      }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {conversationsQuery.isLoading ? (
            <ConversationsSkeleton />
          ) : conversationsQuery.isError ? (
            <div className="px-2 py-8 text-center text-xs text-destructive">
              Couldn't load conversations.
            </div>
          ) : !conversationsQuery.data ||
            conversationsQuery.data.length === 0 ? (
            <EmptyConversations archived={archived} />
          ) : (
            conversationsQuery.data.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                isActive={c.id === activeConversationId}
                folders={folders}
                onSelect={() => onSelect?.()}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer — archived toggle */}
      <div className="border-t p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={archived ? "secondary" : "ghost"}
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={() => setArchived((a) => !a)}
              aria-pressed={archived}
            >
              <Archive className="size-3.5" aria-hidden="true" />
              {archived ? "Showing archived" : "Show archived"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {archived ? "Show active conversations" : "Show archived conversations"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
