"use client";

import { Loader2, Sparkles } from "lucide-react";

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-2xl">
        <Sparkles className="text-primary h-8 w-8 animate-pulse" />
      </div>
      <h3 className="mt-4 text-lg font-medium">Generating content...</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        The AI is crafting your content. This may take a moment.
      </p>
      <Loader2 className="text-muted-foreground mt-4 h-5 w-5 animate-spin" />
    </div>
  );
}
