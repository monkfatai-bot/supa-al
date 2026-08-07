"use client";

/**
 * Supa AI — Error rate chart (admin overview, Phase 3 placeholder).
 *
 * A Recharts `AreaChart` showing the *intended* shape of an error-rate
 * time-series. Phase 3 does NOT yet have a time-series aggregation
 * endpoint over `ai_usage` — the existing `/api/chat/usage` returns a
 * single month-to-date summary, not per-day buckets. Building a real
 * chart would require either:
 *
 *   - a new `/api/chat/usage/timeseries` route backed by a
 *     `date_trunc('day', created_at)` aggregation over `ai_usage`, OR
 *   - a separate analytics pipeline (e.g. a daily rollup table).
 *
 * Rather than fabricate fake data, this component renders an empty
 * chart with an honest inline note: "Time-series analytics available
 * after 24h of data collection." When the aggregation endpoint ships,
 * swap the empty state for an `AreaChart` populated from that route.
 *
 * @module @/components/admin/error-rate-chart
 */
import * as React from "react";
import { Clock } from "lucide-react";

import { Separator } from "@/components/ui/separator";

export interface ErrorRateChartProps {
  className?: string;
}

export function ErrorRateChart({ className }: ErrorRateChartProps) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Error rate (7 days)</h4>
          <p className="text-xs text-muted-foreground">
            Daily error rate across all providers.
          </p>
        </div>
      </div>
      <Separator className="mb-3" />

      <div
        className="flex h-56 flex-col items-center justify-center gap-3 rounded-md border border-dashed text-center"
        role="status"
        aria-live="polite"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Clock className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1 px-6">
          <p className="text-sm font-medium">Time-series analytics available after 24h of data collection</p>
          <p className="mx-auto max-w-md text-xs text-muted-foreground text-pretty">
            Phase 3 records per-request usage into{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
              ai_usage
            </code>
            , but a per-day aggregation endpoint isn&apos;t wired up yet. Once it
            is, this surface will render a real 7-day error-rate area chart.
          </p>
        </div>
      </div>
    </div>
  );
}
