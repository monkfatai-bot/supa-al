"use client";

/**
 * Supa AI — Image editor (Phase 4 edit controls).
 *
 * Renders the enhance / upscale / remove-background action buttons
 * for a single image generation. Calls the corresponding mutation
 * hooks and surfaces the result via {@link onEnhanced}.
 *
 * @module @/components/image/image-editor
 */
import * as React from "react";
import { Eraser, Loader2, Sparkles, ZoomIn } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ImageGeneration } from "@/lib/image/client";
import {
  useEnhanceImage,
  useRemoveImageBackground,
  useUpscaleImage,
} from "@/hooks/use-images";
import { Button } from "@/components/ui/button";

/** Props accepted by {@link ImageEditor}. */
export interface ImageEditorProps {
  generation: ImageGeneration;
  /** Called when an edit operation succeeds. */
  onEnhanced?: (generation: ImageGeneration) => void;
  className?: string;
}

type EditOp = "enhance" | "upscale" | "remove-background";

export function ImageEditor({
  generation,
  onEnhanced,
  className,
}: ImageEditorProps) {
  const enhance = useEnhanceImage();
  const upscale = useUpscaleImage();
  const removeBg = useRemoveImageBackground();

  const pendingOp: EditOp | null = enhance.isPending
    ? "enhance"
    : upscale.isPending
      ? "upscale"
      : removeBg.isPending
        ? "remove-background"
        : null;

  const run = async (op: EditOp) => {
    const input = { generationId: generation.id as never, operation: op };
    let result: ImageGeneration | undefined;
    if (op === "enhance") {
      result = await enhance.mutateAsync(input);
    } else if (op === "upscale") {
      result = await upscale.mutateAsync(input);
    } else {
      result = await removeBg.mutateAsync(input);
    }
    if (result) onEnhanced?.(result);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => run("enhance")}
        disabled={!!pendingOp}
      >
        {pendingOp === "enhance" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-4" aria-hidden="true" />
        )}
        Enhance
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => run("upscale")}
        disabled={!!pendingOp}
      >
        {pendingOp === "upscale" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ZoomIn className="size-4" aria-hidden="true" />
        )}
        Upscale
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => run("remove-background")}
        disabled={!!pendingOp}
      >
        {pendingOp === "remove-background" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Eraser className="size-4" aria-hidden="true" />
        )}
        Remove BG
      </Button>
    </div>
  );
}
