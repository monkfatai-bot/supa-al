"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageCard } from "./image-card";
import type { ImageHistoryItem } from "@/services/image/actions";

interface ImageGalleryProps {
  items: ImageHistoryItem[];
  activeId?: string;
  imageUrls: Map<string, string>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onDuplicate: (id: string) => void;
}

export function ImageGallery({
  items,
  activeId,
  imageUrls,
  onSelect,
  onDelete,
  onToggleFavorite,
  onDuplicate,
}: ImageGalleryProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Gallery</h3>
        <span className="text-muted-foreground text-xs">{items.length} image{items.length !== 1 ? "s" : ""}</span>
      </div>
      <ScrollArea className="h-[calc(100vh-280px)]">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No images generated yet. Create your first one!
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 pr-3">
            {items.map((item) => (
              <ImageCard
                key={item.generation.id}
                item={item}
                imageUrl={item.asset ? imageUrls.get(item.asset.storage_path) ?? null : null}
                onSelect={() => onSelect(item.generation.id)}
                onDelete={onDelete}
                onToggleFavorite={(fav) => onToggleFavorite(item.generation.id, fav)}
                onDuplicate={() => onDuplicate(item.generation.id)}
                isActive={item.generation.id === activeId}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
