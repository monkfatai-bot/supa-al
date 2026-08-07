"use client";

/**
 * Supa AI — Video player (Phase 5).
 *
 * A small, accessible `<video>` wrapper with a status overlay for the
 * "still generating" / "failed" states. Used by the gallery to render
 * completed results inline.
 *
 * @module @/components/video/video-player
 */
import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VideoStatus } from "@/lib/video/client";

export interface VideoPlayerProps {
  /** Public or signed URL of the rendered video (set when `status === 'completed'`). */
  url?: string | null;
  /** Lifecycle status of the generation row. */
  status?: VideoStatus;
  /** Poster image (set to the source image for image-to-video flows). */
  poster?: string | null;
  /** Error message (when `status === 'failed'`). */
  error?: string | null;
  /** Progress percentage (0..100) while processing. */
  progress?: number | null;
  className?: string;
  /** Loop the video (default true for gallery previews). */
  loop?: boolean;
  /** Auto-play (muted) on mount (default true). */
  autoPlay?: boolean;
}

export function VideoPlayer({
  url,
  status = "completed",
  poster,
  error,
  progress,
  className,
  loop = true,
  autoPlay = true,
}: VideoPlayerProps) {
  if (status !== "completed" || !url) {
    return (
      <div
        className={cn(
          "flex aspect-video w-full items-center justify-center rounded-md border bg-muted/40",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        {status === "failed" ? (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <AlertCircle className="size-8 text-destructive" aria-hidden />
            <p className="text-sm font-medium text-destructive">
              Generation failed
            </p>
            {error && (
              <p className="line-clamp-3 max-w-prose text-xs text-muted-foreground">
                {error}
              </p>
            )}
          </div>
        ) : status === "cancelled" ? (
          <p className="text-sm text-muted-foreground">Generation cancelled.</p>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <Loader2
              className="size-8 animate-spin text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm font-medium text-foreground">
              {status === "pending" ? "Queued…" : "Generating…"}
            </p>
            {typeof progress === "number" && progress > 0 ? (
              <p className="text-xs text-muted-foreground">{progress}%</p>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <video
      src={url}
      poster={poster ?? undefined}
      controls
      loop={loop}
      muted={autoPlay}
      autoPlay={autoPlay}
      playsInline
      className={cn(
        "aspect-video w-full rounded-md border bg-black object-contain",
        className,
      )}
    />
  );
}
