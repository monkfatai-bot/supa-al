import * as React from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Supa AI — Status badge.
 *
 * A small pill with a colored dot that conveys a discrete operational status
 * at a glance. Used for "configured / not configured", "ok / warning /
 * error / disabled", etc. The dot color is the primary signal; the label
 * is the secondary signal.
 *
 * Variants map to the shadcn neutral palette plus an emerald accent for
 * the `ok` state (the only state we ever want to draw the eye to).
 *
 * @module @/components/shared/status-badge
 */
export type StatusBadgeStatus = "ok" | "warning" | "error" | "disabled";

export interface StatusBadgeProps {
  status: StatusBadgeStatus;
  /** Visible text. Defaults to a humanized version of `status`. */
  label?: string;
  className?: string;
}

const STATUS_LABEL: Record<StatusBadgeStatus, string> = {
  ok: "Operational",
  warning: "Degraded",
  error: "Error",
  disabled: "Not configured",
};

const STATUS_STYLES: Record<StatusBadgeStatus, string> = {
  ok: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "border-transparent bg-destructive/10 text-destructive dark:text-red-400",
  disabled:
    "border-transparent bg-muted text-muted-foreground",
};

const DOT_STYLES: Record<StatusBadgeStatus, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-destructive",
  disabled: "bg-muted-foreground/50",
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const text = label ?? STATUS_LABEL[status];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", STATUS_STYLES[status], className)}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", DOT_STYLES[status])}
      />
      {text}
    </Badge>
  );
}
