import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Supa AI — "Coming in Phase 2" badge.
 *
 * Tiny inline marker rendered next to nav items / settings rows that exist
 * in the UI as a deliberate preview of what's coming next. Always
 * non-interactive — purely informational.
 *
 * @module @/components/shared/coming-soon
 */
export interface ComingSoonProps {
  /** Override the label. Defaults to "Phase 2". */
  label?: string;
  className?: string;
}

export function ComingSoon({ label = "Phase 2", className }: ComingSoonProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-dashed border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
