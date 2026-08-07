"use client";

/**
 * Supa AI — Image gallery (Phase 4).
 *
 * A responsive grid of past image generations. Clicking a tile opens
 * a lightbox dialog showing the full image + the prompt + the
 * provider/model used + the delete + edit actions.
 *
 * @module @/components/image/image-gallery
 */
import * as React from "react";
import { Image as ImageIcon, Loader2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ImageGeneration } from "@/lib/image/client";
import { useDeleteImage, useImageHistory } from "@/hooks/use-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ImageEditor } from "./image-editor";

/** Props accepted by {@link ImageGallery}. */
export interface ImageGalleryProps {
  className?: string;
}

export function ImageGallery({ className }: ImageGalleryProps) {
  const query = useImageHistory({ limit: 60 });
  const deleteMutation = useDeleteImage();
  const [selected, setSelected] = React.useState<ImageGeneration | null>(null);

  const generations = query.data ?? [];

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setSelected(null);
  };

  if (query.isLoading) {
    return (
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (generations.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No images yet"
        description="Generate your first image on the Generate tab to see it here."
        className={className}
      />
    );
  }

  return (
    <>
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>
        {generations.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setSelected(g)}
            className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
            aria-label={`View image: ${g.prompt}`}
          >
            {g.result_url ? (
              <img
                src={g.result_url}
                alt={g.prompt}
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="size-6" aria-hidden="true" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-left">
              <p className="line-clamp-2 text-[10px] text-white/90">
                {g.prompt}
              </p>
            </div>
            {g.status === "pending" || g.status === "processing" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="size-6 animate-spin text-white" aria-hidden="true" />
              </div>
            ) : null}
          </button>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="line-clamp-2 text-base">
              {selected?.prompt}
            </DialogTitle>
            <DialogDescription>
              {selected?.provider} · {selected?.model}
              {selected?.style ? ` · ${selected.style}` : ""}
              {selected?.size ? ` · ${selected.size}` : ""}
            </DialogDescription>
          </DialogHeader>
          {selected?.result_url ? (
            <div className="overflow-hidden rounded-lg border">
              <img
                src={selected.result_url}
                alt={selected.prompt}
                className="h-auto w-full"
              />
            </div>
          ) : null}
          {selected ? (
            <ImageEditor
              generation={selected}
              onEnhanced={(g) => setSelected(g)}
              className="pt-2"
            />
          ) : null}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => selected && handleDelete(selected.id)}
              disabled={deleteMutation.isPending || !selected}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
