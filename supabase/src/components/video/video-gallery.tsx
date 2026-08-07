"use client";

/**
 * Supa AI — Video gallery (Phase 5).
 *
 * Grid of past video generations, newest first. Each card shows the
 * prompt (truncated), the provider badge, the lifecycle status, and
 * the player when the row is `completed`. Filterable by status + a
 * free-text search over the prompt.
 *
 * @module @/components/video/video-gallery
 */
import * as React from "react";
import { Film, Search, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VideoStatus } from "@/lib/video/client";
import type { VideoGeneration } from "@/lib/video/client";
import {
  useDeleteVideo,
  useVideoHistory,
  type ListVideosOptions,
} from "@/hooks/use-videos";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

import { VideoPlayer } from "./video-player";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<VideoStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export interface VideoGalleryProps {
  className?: string;
}

export function VideoGallery({ className }: VideoGalleryProps) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<VideoStatus | "all">("all");
  const debounced = React.useDeferredValue(search);
  const { toast } = useToast();

  const opts: ListVideosOptions = React.useMemo(
    () => ({
      search: debounced || undefined,
      status: status === "all" ? undefined : status,
      limit: 30,
    }),
    [debounced, status],
  );

  const query = useVideoHistory(opts);
  const del = useDeleteVideo();

  const handleDelete = React.useCallback(
    async (id: string) => {
      try {
        await del.mutateAsync(id);
        toast({ title: "Video deleted." });
      } catch (err) {
        toast({
          title: "Failed to delete",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    },
    [del, toast],
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts…"
            className="pl-9"
            aria-label="Search video history"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as VideoStatus | "all")}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-full rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={Film}
          title="Couldn't load videos"
          description={
            query.error instanceof Error
              ? query.error.message
              : "Please try again."
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => query.refetch()}>
              Retry
            </Button>
          }
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          icon={Film}
          title="No videos yet"
          description="Generate your first video from the Generate tab — it will appear here as soon as it's enqueued."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(query.data ?? []).map((g) => (
            <div
              key={g.id}
              className="overflow-hidden rounded-lg border bg-card shadow-sm"
            >
              <VideoPlayer
                url={g.result_url}
                status={g.status}
                poster={g.source_image_url ?? undefined}
                error={g.error}
                progress={null}
              />
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_COLORS[g.status],
                    )}
                  >
                    {g.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(g.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-foreground">
                  {g.prompt}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {g.provider} · {g.model}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(g.id)}
                    disabled={del.isPending}
                    aria-label="Delete video"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
