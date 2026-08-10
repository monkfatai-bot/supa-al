import { Bot, Loader2 } from "lucide-react";

export function LoadingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <Bot className="h-4 w-4" />
      </div>
      <div className="bg-muted rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Thinking...
        </div>
      </div>
    </div>
  );
}
