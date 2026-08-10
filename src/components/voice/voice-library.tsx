"use client";

import { FileAudio, Heart, Trash2, Copy, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VoiceHistoryItem } from "@/services/voice/actions";

interface VoiceLibraryProps {
  items: VoiceHistoryItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<{ success: boolean; message: string }>;
  onToggleFavorite: (id: string, fav: boolean) => Promise<void>;
  onDuplicate: (id: string) => Promise<{ success: boolean; message: string }>;
}

const OPERATION_LABELS: Record<string, string> = {
  tts: "TTS",
  stt: "STT",
  sts: "STS",
  clone: "Clone",
  translate: "Translate",
  dubbing: "Dubbing",
};

export function VoiceLibrary({ items, activeId, onSelect, onDelete, onToggleFavorite, onDuplicate }: VoiceLibraryProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileAudio className="h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">No voice history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium px-1">History</h3>
      {items.map((item) => (
        <VoiceLibraryItem
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

function VoiceLibraryItem({
  item,
  isActive,
  onSelect,
  onDelete,
  onToggleFavorite,
  onDuplicate,
}: {
  item: VoiceHistoryItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (id: string) => Promise<{ success: boolean; message: string }>;
  onToggleFavorite: (id: string, fav: boolean) => Promise<void>;
  onDuplicate: (id: string) => Promise<{ success: boolean; message: string }>;
}) {
  const { generation } = item;
  const isProcessing = generation.status === "queued" || generation.status === "processing";
  const opLabel = OPERATION_LABELS[generation.operation_type] ?? generation.operation_type;

  function formatTimestamp(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  return (
    <div
      className={cn(
        "group relative rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent",
        isActive && "bg-accent border-primary"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center rounded-md">
          {isProcessing ? (
            <span className="animate-spin text-sm">&#9696;</span>
          ) : generation.status === "completed" ? (
            <FileAudio className="h-5 w-5 text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">Failed</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {generation.input_text ?? generation.transcript_text ?? "Untitled"}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {opLabel}
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {generation.model}
            </Badge>
            <Badge
              variant={
                generation.status === "completed"
                  ? "default"
                  : generation.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
              className="text-[10px] px-1.5 py-0"
            >
              {generation.status}
            </Badge>
          </div>
          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatTimestamp(generation.created_at)}</span>
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
