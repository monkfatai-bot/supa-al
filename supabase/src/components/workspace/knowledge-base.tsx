"use client";

/**
 * Supa AI — Phase 9 Workspace knowledge base.
 *
 * Lists knowledge articles and exposes a create-new-article dialog
 * (title, content, source type, tags). Reads
 * `/api/workspace/workspaces/:id/knowledge` via {@link useKnowledge};
 * mutates via {@link useCreateKnowledgeArticle}.
 *
 * @module @/components/workspace/knowledge-base
 */
import * as React from "react";
import { BookOpen, Plus, Tag } from "lucide-react";

import { cn } from "@/lib/utils";
import type { KnowledgeSourceType } from "@/lib/workspace/client";
import {
  useCreateKnowledgeArticle,
  useKnowledge,
} from "@/hooks/use-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export interface KnowledgeBaseProps {
  workspaceId: string;
  className?: string;
}

const SOURCE_LABEL: Record<KnowledgeSourceType, string> = {
  document: "Document",
  file: "File",
  url: "URL",
  manual: "Manual",
  "ai-generated": "AI-generated",
};

export function KnowledgeBase({
  workspaceId,
  className,
}: KnowledgeBaseProps) {
  const query = useKnowledge(workspaceId);
  const createMutation = useCreateKnowledgeArticle();
  const { toast } = useToast();

  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [sourceType, setSourceType] = React.useState<KnowledgeSourceType>("manual");
  const [tags, setTags] = React.useState("");

  const handleCreate = React.useCallback(async () => {
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await createMutation.mutateAsync({
        workspaceId,
        input: {
          title,
          content: content || null,
          sourceType,
          tags: tagList,
        },
      });
      toast({ title: "Knowledge article created" });
      setOpen(false);
      setTitle("");
      setContent("");
      setSourceType("manual");
      setTags("");
    } catch (err) {
      toast({
        title: "Failed to create article",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [createMutation, workspaceId, title, content, sourceType, tags, toast]);

  return (
    <div className={cn("space-y-4", className)}>
      <header className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
            Knowledge base
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {query.data?.length ?? 0} article(s) — used to ground the AI assistant.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" aria-hidden="true" />
              New article
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>New knowledge article</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Article title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                placeholder="Article content (markdown)…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
              />
              <Select
                value={sourceType}
                onValueChange={(v) => setSourceType(v as KnowledgeSourceType)}
              >
                <SelectTrigger className="w-full" aria-label="Source type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="ai-generated">AI-generated</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Comma-separated tags (e.g. onboarding, hr)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!title.trim() || createMutation.isPending}
                onClick={handleCreate}
              >
                {createMutation.isPending ? "Creating…" : "Create article"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={BookOpen}
          title="Couldn't load articles"
          description="Please try again."
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No knowledge articles yet"
          description="Add your first article to start grounding the AI assistant."
        />
      ) : (
        <ul className="space-y-2">
          {query.data!.map((article) => (
            <li key={article.id} className="rounded-md border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="truncate text-sm font-medium">{article.title}</h3>
                <Badge variant="outline" className="text-[10px]">
                  {SOURCE_LABEL[article.source_type ?? "manual"]}
                </Badge>
              </div>
              {article.content ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {article.content}
                </p>
              ) : null}
              {article.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {article.tags.slice(0, 5).map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-[10px] font-normal"
                    >
                      <Tag className="mr-1 size-2.5" aria-hidden="true" />
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
