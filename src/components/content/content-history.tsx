"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteContent, regenerateContent } from "@/services/content/actions";
import { getContentTypeLabel } from "@/services/content/prompt-builder";
import type { AiContent } from "@/services/content";

interface ContentHistoryProps {
  items: AiContent[];
  activeId?: string;
}

export function ContentHistory({ items, activeId }: ContentHistoryProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteContent(id);
      if (result.success) {
        router.refresh();
      }
    });
  }

  function handleRegenerate(id: string) {
    startTransition(async () => {
      const result = await regenerateContent(id);
      if (result.success) {
        router.refresh();
      }
    });
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <h3 className="text-sm font-medium">History</h3>
        <p className="text-muted-foreground text-xs">{items.length} item{items.length !== 1 ? "s" : ""}</p>
      </div>
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-4">
          {items.length === 0 && (
            <p className="text-muted-foreground px-2 py-8 text-center text-sm">
              No content yet. Generate your first piece!
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className={`group flex items-start gap-2 rounded-md p-2 text-sm hover:bg-accent ${
                item.id === activeId ? "bg-accent" : ""
              }`}
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {getContentTypeLabel(item.content_type)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(item.updated_at)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Regenerate"
                  onClick={() => handleRegenerate(item.id)}
                  disabled={isPending}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Content</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete &quot;{item.title}&quot;? This
                        action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={() => handleDelete(item.id)}
                        disabled={isPending}
                      >
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
