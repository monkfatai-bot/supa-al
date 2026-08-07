import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Supa AI — Stat card.
 *
 * Compact metric tile used in dashboard overview rows. Shows a label, a big
 * number, an optional icon, an optional trend (positive/negative delta), and
 * a one-line hint. Designed to tile cleanly in a 1/2/4-column responsive
 * grid.
 *
 * @module @/components/shared/stat-card
 */
export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Signed numeric delta. Positive renders green, negative renders red. */
  trend?: number;
  /** Optional suffix appended to the trend (e.g. "%", " MoM"). */
  trendSuffix?: string;
  hint?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendSuffix = "%",
  hint,
  className,
}: StatCardProps) {
  const trendUp = typeof trend === "number" ? trend >= 0 : null;
  return (
    <Card className={cn("overflow-hidden py-0", className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {label}
            </p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {value}
            </p>
          </div>
          {Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          ) : null}
        </div>
        {(trendUp !== null || hint) && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            {trendUp !== null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
                  trendUp
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive dark:text-red-400",
                )}
              >
                {trendUp ? (
                  <TrendingUp className="size-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3" aria-hidden="true" />
                )}
                {Math.abs(trend ?? 0)}
                {trendSuffix}
              </span>
            ) : null}
            {hint ? (
              <span className="text-muted-foreground truncate">{hint}</span>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
