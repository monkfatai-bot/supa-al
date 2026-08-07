"use client";

/**
 * Supa AI — Phase 9 Workspace comments panel.
 *
 * Lists comments scoped to a workspace (optionally filtered to a
 * document). Supports creating new comments, resolving, and deleting.
 *
 * Reads `/api/workspace/comments?workspaceId=…&documentId=…` via
 * {@link useComments}; mutates via {@link useCreateComment},
 * {@link useUpdateComment}, {@link useDeleteComment}.
 *
 * @module @/components/workspace/comments-panel
 */
import * as React from "react";
import { Check, MessageSquare, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export interface CommentsPanelProps {
  workspaceId: string;
  documentId?: string;
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
  documentId,
  className,
}: CommentsPanelProps) {
  const query = useComments(workspaceId, { documentId });
  const createMutation = useCreateComment();
  const updateMutation = useUpdateComment();
  const deleteMutation = useDeleteComment();
  const { toast } = useToast();

  const [draft, setDraft] = React.useState("");

  const handleCreate = React.useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await createMutation.mutateAsync({
        workspaceId,
        documentId: documentId ?? null,
        body,
      });
      setDraft("");
    } catch (err) {
      toast({
        title: "Failed to post comment",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [createMutation, workspaceId, documentId, draft, toast]);

  const handleToggleResolve = React.useCallback(
    async (commentId: string, currentlyResolved: boolean) => {
      try {
        await updateMutation.mutateAsync({
          workspaceId,
          commentId,
          input: { resolved: !currentlyResolved },
        });
      } catch (err) {
        toast({
          title: "Failed to update comment",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [updateMutation, workspaceId, toast],
  );

  const handleDelete = React.useCallback(
    async (commentId: string) => {
      try {
        await deleteMutation.mutateAsync({ workspaceId, commentId });
      } catch (err) {
        toast({
          title: "Failed to delete comment",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [deleteMutation, workspaceId, toast],
  );

  return (
    <aside
      className={cn(
        "flex w-full flex-col gap-2 border-l bg-background/40 p-3 sm:w-80",
        className,
      )}
      aria-label="Comments"
    >
      <header className="flex items-center gap-2">
        <MessageSquare
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold">Comments</h2>
      </header>
      <Textarea
        placeholder="Write a comment…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
      />
      <Button
        size="sm"
        className="self-end"
        disabled={!draft.trim() || createMutation.isPending}
        onClick={handleCreate}
      >
        {createMutation.isPending ? "Posting…" : "Post comment"}
      </Button>

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
          description="Please try again."
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No comments yet"
          description="Start the conversation."
        />
      ) : (
        <ul className="space-y-1.5 overflow-y-auto">
          {query.data!.map((c) => (
            <li
              key={c.id}
              className={cn(
                "rounded-md border p-2 text-xs",
                c.resolved && "bg-muted/40",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <code className="font-mono text-[10px] text-muted-foreground">
                  {c.author_id.slice(0, 8)}
                </code>
                <span className="text-[10px] text-muted-foreground">
                  {formatTimestamp(c.created_at)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-foreground/90">
                {c.body}
              </p>
              <div className="mt-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={updateMutation.isPending}
                  onClick={() => handleToggleResolve(c.id, c.resolved)}
                >
                  <Check className="mr-1 size-3" aria-hidden="true" />
                  {c.resolved ? "Reopen" : "Resolve"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => handleDelete(c.id)}
                >
                  <Trash2 className="mr-1 size-3" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
