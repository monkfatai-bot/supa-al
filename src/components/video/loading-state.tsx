"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";
import type { VideoJob } from "@/types/generated/database";

interface VideoLoadingStateProps {
  job: VideoJob;
  onCancel: (jobId: string) => Promise<void>;
}

export function VideoLoadingState({ job, onCancel }: VideoLoadingStateProps) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Generating Video</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {job.status === "queued" ? "Waiting in queue..." : "Processing..."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onCancel(job.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Progress value={job.progress_percent} className="h-2" />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{job.progress_percent}%</span>
        <span>Attempt {job.attempt} of {job.max_attempts}</span>
      </div>

      {job.provider && (
        <p className="text-xs text-muted-foreground">
          Provider: {job.provider} | Model: {job.model}
        </p>
      )}
    </div>
  );
}
