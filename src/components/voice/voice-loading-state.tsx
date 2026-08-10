"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";
import type { VoiceJob } from "@/types/generated/database";

interface VoiceLoadingStateProps {
  job: VoiceJob;
  onCancel: (jobId: string) => Promise<void>;
}

export function VoiceLoadingState({ job, onCancel }: VoiceLoadingStateProps) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Processing Audio</p>
          <p className="text-xs text-muted-foreground">
            {job.provider} &middot; {job.model}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCancel(job.id)}
        >
          <X className="mr-1.5 h-4 w-4" />
          Cancel
        </Button>
      </div>

      <Progress value={job.progress_percent} className="h-2" />

      <p className="text-xs text-muted-foreground">
        {job.progress_percent < 10
          ? "Starting..."
          : job.progress_percent < 90
            ? `Processing... ${job.progress_percent}%`
            : "Almost done..."}
      </p>

      {job.error_message && (
        <p className="text-xs text-destructive">{job.error_message}</p>
      )}
    </div>
  );
}
