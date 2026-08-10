"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Heart, Copy, Trash2, Download } from "lucide-react";
import type { VideoHistoryItem } from "@/services/video/actions";

interface VideoPlayerProps {
  item: VideoHistoryItem;
  videoUrl: string;
  thumbnailUrl: string | null;
  onToggleFavorite: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isFavorite: boolean;
}

export function VideoPlayer({ item, videoUrl, thumbnailUrl, onToggleFavorite, onDuplicate, onDelete, isFavorite }: VideoPlayerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { generation } = item;

  const handleDownload = async () => {
    try {
      const resp = await fetch(videoUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `supa-ai-${generation.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(videoUrl, "_blank");
    }
  };

  return (
    <div className="space-y-4">
      {/* Video element */}
      <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
        <video
          src={videoUrl}
          poster={thumbnailUrl ?? undefined}
          controls
          className="h-full w-full"
          preload="metadata"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToggleFavorite}>
          <Heart className={isFavorite ? "h-4 w-4 fill-red-500 text-red-500" : "h-4 w-4 mr-1"} />
          {isFavorite ? "Unfavorite" : "Favorite"}
        </Button>
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-1" />
          Regenerate
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
        <Button variant="outline" size="sm" className="text-destructive" onClick={() => { setIsOpen(true); }}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>

      {/* Delete confirmation */}
      {isOpen && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm font-medium">Delete this video?</p>
          <p className="text-sm text-muted-foreground">This action cannot be undone. The video and all associated data will be permanently removed.</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => { onDelete(); setIsOpen(false); }}>
              Confirm Delete
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
