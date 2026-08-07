"use client";

/**
 * Supa AI — Usage metrics cards (admin overview row).
 *
 * Presentational row of four stat cards summarizing the current month's
 * AI usage:
 *
 *   1. Total Requests  — request count (raw integer).
 *   2. Total Tokens    — input + output tokens (compact-formatted).
 *   3. Total Cost      — USD-formatted from `totalCostCents`.
 *   4. Error Rate      — aggregated from provider health, color-coded:
 *                         green <1%, amber <5%, red ≥5%.
 *
 * HONEST CAVEAT: the usage endpoint is scoped to the *caller* — it does
 * not aggregate across all users. The parent surfaces an inline note;
 * this component simply renders the numbers it's given.
 *
 * @module @/components/admin/usage-metrics
 */
import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Coins,
  Hash,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils/index";
import { StatCard } from "@/components/shared/stat-card";

export interface UsageMetricsProps {
  /** Total request count for the period (current calendar month). */
  requestCount: number;
  /** Total tokens (input + output) for the period. */
  totalTokens: number;
  /** Total cost in USD cents for the period. */
  totalCostCents: number;
  /**
   * Aggregated error rate across all providers (0–1). Computed by the
   * parent as `totalErrors / totalRequests` from the health snapshot.
   */
  errorRate: number;
  className?: string;
}

/** Pick an error-rate color: emerald when low, amber when elevated, red when high. */
function errorRateColor(rate: number): {
  className: string;
  label: string;
} {
  if (rate < 0.01) {
    return {
      className: "text-emerald-600 dark:text-emerald-400",
      label: "Low",
    };
  }
  if (rate < 0.05) {
    return {
      className: "text-amber-600 dark:text-amber-400",
      label: "Elevated",
    };
  }
  return {
    className: "text-destructive dark:text-red-400",
    label: "High",
  };
}

export function UsageMetrics({
  requestCount,
  totalTokens,
  totalCostCents,
  errorRate,
  className,
}: UsageMetricsProps) {
  const errorPercent = errorRate * 100;
  const errMeta = errorRateColor(errorRate);
  const costUsd = totalCostCents / 100;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
      role="list"
      aria-label="Usage metrics"
    >
      <div role="listitem">
        <StatCard
          label="Total Requests"
          value={
            <span className="tabular-nums">
              {requestCount.toLocaleString()}
            </span>
          }
          icon={Hash}
          hint="This month, your account"
        />
      </div>
      <div role="listitem">
        <StatCard
          label="Total Tokens"
          value={
            <span className="tabular-nums">
              {formatNumber(totalTokens, { notation: "standard" })}
            </span>
          }
          icon={Activity}
          hint="Input + output combined"
        />
      </div>
      <div role="listitem">
        <StatCard
          label="Total Cost"
          value={
            <span className="tabular-nums">
              {formatCurrency(costUsd)}
            </span>
          }
          icon={Coins}
          hint="Month-to-date"
        />
      </div>
      <div role="listitem">
        <StatCard
          label="Error Rate"
          value={
            <span className={cn("tabular-nums", errMeta.className)}>
              {errorPercent.toFixed(errorPercent < 10 ? 2 : 1)}%
            </span>
          }
          icon={AlertTriangle}
          hint={`${errMeta.label} · across all providers`}
        />
      </div>
    </div>
  );
}
