"use client";

import { Badge } from "@/components/ui/badge";
import type { VideoHistoryItem } from "@/services/video/actions";

interface VideoDetailsProps {
  item: VideoHistoryItem;
}

export function VideoDetails({ item }: VideoDetailsProps) {
  const { generation } = item;

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <h3 className="text-sm font-semibold">Generation Details</h3>
      
      <div className="grid grid-cols-2 gap-3 text-sm">
        <DetailRow label="Model" value={generation.model} />
        <DetailRow label="Provider" value={generation.provider} />
        <DetailRow label="Status" value={
          <Badge variant={generation.status === "completed" ? "default" : "secondary"}>
            {generation.status}
          </Badge>
        } />
        <DetailRow label="Type" value={generation.generation_type} />
        <DetailRow label="Resolution" value={generation.resolution ?? "N/A"} />
        <DetailRow label="Duration" value={generation.duration_seconds ? `${generation.duration_seconds}s` : "N/A"} />
        <DetailRow label="FPS" value={generation.fps ? String(generation.fps) : "N/A"} />
        <DetailRow label="Aspect Ratio" value={generation.aspect_ratio ?? "N/A"} />
        <DetailRow label="Credits" value={String(generation.credits_used)} />
        <DetailRow label="Gen Time" value={generation.generation_time_ms ? `${(generation.generation_time_ms / 1000).toFixed(1)}s` : "N/A"} />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Prompt</p>
        <p className="text-sm">{generation.prompt}</p>
      </div>

      {generation.negative_prompt && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Negative Prompt</p>
          <p className="text-sm">{generation.negative_prompt}</p>
        </div>
      )}

      {generation.error_message && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-destructive">Error</p>
          <p className="text-sm text-destructive">{generation.error_message}</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Created: {new Date(generation.created_at).toLocaleString()}
        {generation.completed_at && ` | Completed: ${new Date(generation.completed_at).toLocaleString()}`}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div>{value}</div>
    </div>
  );
}
