"use client";

import { Loader2, ImageIcon } from "lucide-react";

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-2xl">
        <ImageIcon className="text-primary h-8 w-8 animate-pulse" />
      </div>
      <h3 className="mt-4 text-lg font-medium">Generating image...</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        The AI is creating your image. This may take 10-30 seconds.
      </p>
      <Loader2 className="text-muted-foreground mt-4 h-5 w-5 animate-spin" />
    </div>
  );
}
