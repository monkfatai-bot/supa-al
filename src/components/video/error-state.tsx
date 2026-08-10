"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface VideoErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function VideoErrorState({ message, onRetry }: VideoErrorStateProps) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold">Generation Failed</h3>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}
