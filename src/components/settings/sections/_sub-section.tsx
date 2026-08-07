import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Supa AI — Settings sub-section card.
 *
 * A small presentational wrapper used by every account-section sub-form
 * (change-password, change-email, download-data, danger zone). Renders a
 * heading row (icon + title + description) followed by a content slot.
 *
 * The `tone="danger"` variant adds a destructive left-border so the
 * delete-account card is visually distinguished from the benign ones.
 *
 * @module @/components/settings/sections/_sub-section
 */
export interface SubSectionProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** `"danger"` adds a destructive accent. */
  tone?: "default" | "danger";
  className?: string;
}

export function SubSection({
  icon: Icon,
  title,
  description,
  children,
  tone = "default",
  className,
}: SubSectionProps) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm sm:p-5",
        tone === "danger" && "border-destructive/40",
        className,
      )}
    >
      <header className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            tone === "danger"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground text-pretty">
              {description}
            </p>
          ) : null}
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
