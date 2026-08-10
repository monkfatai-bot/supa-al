"use client";

import { Video, Heart, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VideoHistoryItem } from "@/services/video/actions";

interface VideoGalleryProps {
  items: VideoHistoryItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<{ success: boolean }>;
  onToggleFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  onDuplicate: (id: string) => Promise<{ success: boolean }>;
}

export function VideoGallery({ items, activeId, onSelect, onDelete, onToggleFavorite, onDuplicate }: VideoGalleryProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Video className="h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">No videos yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium px-1">History</h3>
      {items.map((item) => (
        <VideoGalleryItem
          key={item.generation.id}
          item={item}
          isActive={item.generation.id === activeId}
          onSelect={() => onSelect(item.generation.id)}
          onDelete={onDelete}
          onToggleFavorite={onToggleFavorite}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  );
}

function VideoGalleryItem({
  item,
  isActive,
  onSelect,
  onDelete,
  onToggleFavorite,
  onDuplicate,
}: {
  item: VideoHistoryItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (id: string) => Promise<{ success: boolean }>;
  onToggleFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  onDuplicate: (id: string) => Promise<{ success: boolean }>;
}) {
  const { generation } = item;
  const isProcessing = generation.status === "queued" || generation.status === "processing";

  return (
    <div
      className={cn(
        "group relative rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent",
        isActive && "bg-accent border-primary"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="bg-muted flex h-12 w-20 shrink-0 items-center justify-center rounded-md overflow-hidden">
          {generation.thumbnail_storage_path ? (
            <ThumbnailPlaceholder />
          ) : isProcessing ? (
            <span className="animate-spin text-sm">&#9696;</span>
          ) : generation.status === "completed" ? (
            <Video className="h-5 w-5 text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">Failed</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{generation.prompt}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {generation.model}
            </Badge>
            <Badge
              variant={generation.status === "completed" ? "default" : generation.status === "failed" ? "destructive" : "secondary"}
              className="text-[10px] px-1.5 py-0"
            >
              {generation.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(generation.id, !generation.is_favorite); }}
        >
          <Heart className={cn("h-3.5 w-3.5", generation.is_favorite && "fill-red-500 text-red-500")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onDuplicate(generation.id); }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(generation.id); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ThumbnailPlaceholder() {
  return (
    <div className="bg-gradient-to-br from-primary/20 to-primary/5 h-full w-full flex items-center justify-center">
      <Video className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
