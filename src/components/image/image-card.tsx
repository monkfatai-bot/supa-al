"use client";

import { ImageIcon, Trash2, Heart, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ImageHistoryItem } from "@/services/image/actions";

interface ImageCardProps {
  item: ImageHistoryItem;
  imageUrl: string | null;
  onSelect: () => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (isFavorite: boolean) => void;
  onDuplicate: () => void;
  isActive?: boolean;
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

export function ImageCard({ item, imageUrl, onSelect, onDelete, onToggleFavorite, onDuplicate, isActive }: ImageCardProps) {
  const statusBadge =
    item.generation.status === "completed"
      ? null
      : item.generation.status === "failed"
        ? (
          <div className="bg-destructive/80 text-destructive-foreground absolute inset-0 flex items-center justify-center rounded-md">
            <span className="text-xs font-medium">Failed</span>
          </div>
        )
        : (
          <div className="bg-muted/80 absolute inset-0 flex items-center justify-center rounded-md">
            <span className="text-xs font-medium capitalize">{item.generation.status}</span>
          </div>
        );

  return (
    <div
      className={`group relative cursor-pointer rounded-md border transition-colors ${isActive ? "border-primary ring-1 ring-primary" : "hover:border-accent-foreground/30"}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square overflow-hidden rounded-t-md bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.generation.prompt}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="text-muted-foreground h-8 w-8" />
          </div>
        )}
        {statusBadge}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="truncate text-xs font-medium" title={item.generation.prompt}>
          {item.generation.prompt}
        </p>
        <p className="text-muted-foreground mt-0.5 text-[10px]">
          {item.generation.model} · {formatDate(item.generation.created_at)}
        </p>
      </div>

      {/* Action buttons */}
      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.generation.status === "completed" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full bg-background/80 shadow-sm"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(!item.generation.is_favorite); }}
          >
            <Heart className={`h-3 w-3 ${item.generation.is_favorite ? "fill-red-500 text-red-500" : ""}`} />
          </Button>
        )}
        {item.generation.status === "completed" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full bg-background/80 shadow-sm"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full bg-background/80 shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Image</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this image? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.generation.id);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
