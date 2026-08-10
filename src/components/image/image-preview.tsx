"use client";

import { useState } from "react";
import { Download, ZoomIn, X, Heart, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageHistoryItem } from "@/services/image/actions";

interface ImagePreviewProps {
  item: ImageHistoryItem;
  imageUrl: string;
  onClose: () => void;
  onToggleFavorite?: () => void;
  onDuplicate?: () => void;
  isFavorite?: boolean;
}

export function ImagePreview({ item, imageUrl, onClose, onToggleFavorite, onDuplicate, isFavorite }: ImagePreviewProps) {
  const [isZoomed, setIsZoomed] = useState(false);

  async function handleDownload() {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.generation.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(imageUrl, "_blank");
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative group rounded-lg overflow-hidden border bg-muted/50">
        <img
          src={imageUrl}
          alt={item.generation.prompt}
          className={`w-full object-contain transition-all ${isZoomed ? "max-h-none cursor-zoom-out" : "max-h-[500px] cursor-zoom-in"}`}
          onClick={() => setIsZoomed(!isZoomed)}
        />
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onToggleFavorite && (
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggleFavorite()}
            >
              <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
            </Button>
          )}
          {onDuplicate && (
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDuplicate()}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsZoomed(!isZoomed)}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Prompt:</span>{" "}
          {item.generation.prompt}
        </p>
        {item.asset && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>Model: {item.generation.model}</span>
            <span>Provider: {item.generation.provider}</span>
            <span>
              Size: {(item.asset.metadata as { width?: number; height?: number }).width ?? "?"} x {(item.asset.metadata as { width?: number; height?: number }).height ?? "?"}
            </span>
            {item.generation.credits_used > 0 && <span>Credits: {item.generation.credits_used}</span>}
            {item.generation.generation_time_ms && <span>Time: {(item.generation.generation_time_ms / 1000).toFixed(1)}s</span>}
            <span>
              {new Date(item.generation.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
