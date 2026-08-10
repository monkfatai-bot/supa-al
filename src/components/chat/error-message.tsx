import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="flex gap-3">
      <div className="bg-destructive/10 text-destructive flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <AlertCircle className="h-4 w-4" />
      </div>
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
        <p className="text-sm font-medium text-destructive">Error</p>
        <p className="text-muted-foreground mt-1 text-sm">{message}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}