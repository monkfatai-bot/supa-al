"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState, useCallback } from "react";
import { MessageSquarePlus, Trash2, Pin, Archive, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createConversation,
  deleteConversation,
  pinConversation,
  archiveConversation,
  renameConversation,
  searchConversations,
} from "@/services/chat/actions";
import type { ConversationWithMessageCount } from "@/services/chat";

interface ConversationSidebarProps {
  conversations: ConversationWithMessageCount[];
  activeConversationId?: string;
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
}: ConversationSidebarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationWithMessageCount[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const displayConversations = isSearching ? searchResults : conversations;

  const handleNewChat = () => {
    startTransition(async () => {
      const result = await createConversation();
      if (result.success && result.conversation) {
        router.push(`/chat/${result.conversation.id}`);
      }
    });
  };

  const handleDelete = (conversationId: string) => {
    startTransition(async () => {
      const result = await deleteConversation(conversationId);
      if (result.success) {
        router.push("/chat");
        router.refresh();
      }
    });
  };

  const handlePin = (conversationId: string, isPinned: boolean) => {
    startTransition(async () => {
      await pinConversation(conversationId, !isPinned);
      router.refresh();
    });
  };

  const handleArchive = (conversationId: string) => {
    startTransition(async () => {
      await archiveConversation(conversationId, true);
      router.push("/chat");
      router.refresh();
    });
  };

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        setIsSearching(false);
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      const results = await searchConversations(query);
      setSearchResults(results);
    },
    []
  );

  const handleRename = (convId: string, currentTitle: string) => {
    setRenameId(convId);
    setRenameValue(currentTitle);
  };

  const submitRename = async () => {
    if (!renameId || !renameValue.trim()) {
      setRenameId(null);
      return;
    }
    await renameConversation(renameId, renameValue.trim());
    setRenameId(null);
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <Button
          className="w-full justify-start"
          variant="outline"
          onClick={handleNewChat}
          disabled={isPending}
        >
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-3.5 w-3.5" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-4">
          {displayConversations.length === 0 && (
            <p className="text-muted-foreground px-2 py-8 text-center text-sm">
              {isSearching ? "No conversations found." : "No conversations yet. Start a new chat!"}
            </p>
          )}
          {displayConversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent ${
                conv.id === activeConversationId
                  ? "bg-accent text-accent-foreground"
                  : ""
              }`}
            >
              <Link
                href={`/chat/${conv.id}`}
                className="flex-1 min-w-0"
                title={conv.title}
                onClick={() => setRenameId(null)}
              >
                <div className="flex items-center gap-1">
                  {conv.is_pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  <span className="truncate block">{conv.title}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {conv.message_count} message{conv.message_count !== 1 ? "s" : ""}
                </span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleRename(conv.id, conv.title)}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePin(conv.id, conv.is_pinned)}>
                    {conv.is_pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleArchive(conv.id)}>
                    <Archive className="mr-2 h-3.5 w-3.5" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => handleDelete(conv.id)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Rename Dialog */}
      <Dialog open={renameId !== null} onOpenChange={(open) => { if (!open) setRenameId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
            <DialogDescription>Enter a new name for this conversation.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }}
            maxLength={200}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)}>Cancel</Button>
            <Button onClick={submitRename} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
