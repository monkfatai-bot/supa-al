import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="bg-destructive/10 flex h-16 w-16 items-center justify-center rounded-2xl">
        <AlertCircle className="text-destructive h-8 w-8" />
      </div>
      <h3 className="mt-4 text-lg font-medium">Generation Failed</h3>
      <p className="text-muted-foreground mt-1 max-w-md text-center text-sm">
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}