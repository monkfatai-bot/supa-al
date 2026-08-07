"use client";

/**
 * Supa AI — Copy button.
 *
 * A small icon button that copies the supplied text to the clipboard and
 * surfaces success / failure via a `sonner` toast. Used by settings rows to
 * let operators copy a base URL or env-var name without selecting it.
 *
 * @module @/components/shared/copy-button
 */
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface CopyButtonProps {
  /** The text to write to the clipboard. */
  value: string;
  /** Optional aria-label + tooltip text. Defaults to "Copy to clipboard". */
  label?: string;
  /** What to call the copied thing in the toast — e.g. "API URL". */
  toastName?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary" | "link" | "destructive";
}

export function CopyButton({
  value,
  label = "Copy to clipboard",
  toastName,
  className,
  size = "icon",
  variant = "ghost",
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Legacy fallback for non-secure contexts.
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      toast.success(toastName ? `${toastName} copied` : "Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — try selecting the text manually.");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          onClick={onCopy}
          aria-label={label}
          className={cn("text-muted-foreground hover:text-foreground", className)}
        >
          {copied ? (
            <Check className="size-4 text-emerald-500" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
}
