import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormMessageProps {
  type: "error" | "success";
  message: string;
  className?: string;
}

export function FormMessage({ type, message, className }: FormMessageProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md p-3 text-sm",
        type === "error" && "bg-destructive/10 text-destructive",
        type === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        className
      )}
      role="alert"
    >
      {type === "error" ? (
        <AlertCircle className="h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}
