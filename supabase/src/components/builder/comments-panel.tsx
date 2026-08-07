"use client";

/**
 * Supa AI — Phase 9B Builder — comments panel.
 *
 * Lists comments pinned to the canvas. Supports creating new comments,
 * resolving, and (optionally) editing the body. Comments are scoped to
 * a workflow + workspace.
 *
 * Reads `/api/builder/workflows/:id/comments?workspaceId=…` via
 * {@link useComments}; mutates via {@link useCreateComment} /
 * {@link useUpdateComment}.
 *
 * @module @/components/builder/comments-panel
 */
import * as React from "react";
import { Check, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkflowComment } from "@/lib/builder/client";
import {
  useComments,
  useCreateComment,
  useUpdateComment,
} from "@/hooks/use-builder";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export interface CommentsPanelProps {
  workspaceId: string | null;
  workflowId: string | null;
  className?: string;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommentsPanel({
  workspaceId,
  workflowId,
  className,
}: CommentsPanelProps) {
  const query = useComments(workspaceId, workflowId);
  const createMutation = useCreateComment();
  const updateMutation = useUpdateComment();
  const { toast } = useToast();
  const [draft, setDraft] = React.useState("");

  const handleCreate = React.useCallback(async () => {
    const body = draft.trim();
    if (!body || !workflowId || !workspaceId) return;
    try {
      await createMutation.mutateAsync({
        workflowId,
        input: {
          workspaceId,
          workflowId,
          body,
        },
      });
      setDraft("");
    } catch (err) {
      toast({
        title: "Failed to post comment",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [draft, workflowId, workspaceId, createMutation, toast]);

  const handleToggleResolve = React.useCallback(
    async (comment: WorkflowComment) => {
      if (!workspaceId || !workflowId) return;
      try {
        await updateMutation.mutateAsync({
          workflowId,
          workspaceId,
          commentId: comment.id,
          input: { resolved: !comment.resolved },
        });
      } catch (err) {
        toast({
          title: "Failed to update comment",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [workspaceId, workflowId, updateMutation, toast],
  );

  return (
    <aside
      className={cn(
        "flex w-full flex-col border-l bg-background/40 sm:w-80",
        className,
      )}
      aria-label="Comments"
    >
      <header className="flex items-center gap-2 p-3">
        <MessageSquare className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Comments</h2>
      </header>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3 pt-0">
          {query.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <EmptyState
              icon={MessageSquare}
              title="Couldn't load comments"
              description={query.error instanceof Error ? query.error.message : "Please try again."}
            />
          ) : !query.data || query.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No comments yet. Add the first one below.
            </p>
          ) : (
            query.data.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded-md border bg-card p-2 text-xs",
                  c.resolved && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap break-words">{c.body}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 px-1.5"
                    aria-label={c.resolved ? "Unresolve" : "Resolve"}
                    onClick={() => handleToggleResolve(c)}
                  >
                    <Check
                      className={cn(
                        "size-3.5",
                        c.resolved ? "text-emerald-500" : "text-muted-foreground",
                      )}
                    />
                  </Button>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{formatTimestamp(c.created_at)}</span>
                  {c.resolved && <span className="text-emerald-600">Resolved</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      <div className="border-t p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="text-xs"
          disabled={!workflowId || !workspaceId}
        />
        <Button
          size="sm"
          className="mt-2 w-full"
          disabled={!draft.trim() || !workflowId || !workspaceId || createMutation.isPending}
          onClick={handleCreate}
        >
          {createMutation.isPending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </aside>
  );
}
