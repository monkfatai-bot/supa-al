"use client";

/**
 * Supa AI — Provider health card.
 *
 * Presentational card showing one AI provider's rolling health snapshot:
 *
 *   - Provider name + icon medallion.
 *   - Status badge (colored dot + label): healthy=emerald, degraded=amber,
 *     down=destructive, unknown=muted.
 *   - Success rate: `success_count / (success_count + error_count) * 100`
 *     with a `Progress` bar.
 *   - Average latency in ms.
 *   - Last check (relative time).
 *   - Last error (truncated, full text in a `Tooltip`).
 *   - Total request count (`success_count + error_count`).
 *
 * All data flows in via props — no fetching. The parent (`AdminOverview`)
 * owns the TanStack Query lifecycle.
 *
 * @module @/components/admin/provider-health-card
 */
import * as React from "react";
import { AlertCircle, Clock, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRelativeTime, truncate } from "@/lib/utils/index";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProviderHealthEntry } from "@/hooks/use-admin";

export interface ProviderHealthCardProps {
  /** The provider's label (e.g. "OpenAI"). Falls back to `entry.provider`. */
  label?: string;
  /** The health row from `/api/chat/health`. */
  entry: ProviderHealthEntry;
  /** Extra class names on the outer card. */
  className?: string;
}

/** Status → {dotClass, badgeClass, label} mapping. */
const STATUS_META: Record<
  ProviderHealthEntry["status"],
  { dot: string; badge: string; label: string }
> = {
  healthy: {
    dot: "bg-emerald-500",
    badge:
      "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    label: "Healthy",
  },
  degraded: {
    dot: "bg-amber-500",
    badge:
      "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
    label: "Degraded",
  },
  down: {
    dot: "bg-destructive",
    badge: "border-transparent bg-destructive/10 text-destructive dark:text-red-400",
    label: "Down",
  },
  unknown: {
    dot: "bg-muted-foreground/50",
    badge: "border-transparent bg-muted text-muted-foreground",
    label: "Unknown",
  },
};

/** Compute success rate as a 0–100 percentage. Returns 0 when no requests. */
function successRate(entry: ProviderHealthEntry): number {
  const total = entry.success_count + entry.error_count;
  if (total === 0) return 0;
  return (entry.success_count / total) * 100;
}

/** Pick a progress bar color based on the success rate. */
function progressColor(rate: number): string {
  if (rate >= 95) return "[&_[data-slot=progress-indicator]]:bg-emerald-500";
  if (rate >= 50) return "[&_[data-slot=progress-indicator]]:bg-amber-500";
  return "[&_[data-slot=progress-indicator]]:bg-destructive";
}

export function ProviderHealthCard({
  label,
  entry,
  className,
}: ProviderHealthCardProps) {
  const meta = STATUS_META[entry.status] ?? STATUS_META.unknown;
  const rate = successRate(entry);
  const totalRequests = entry.success_count + entry.error_count;
  const lastErrorTruncated = entry.last_error
    ? truncate(entry.last_error, 48)
    : null;
  const hasLastError = Boolean(entry.last_error);

  return (
    <Card className={cn("overflow-hidden py-0", className)}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {/* Header: provider + status badge ------------------------------ */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ProviderIcon provider={entry.provider} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {label ?? entry.provider}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {entry.provider}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
              meta.badge,
            )}
            aria-label={`Status: ${meta.label}`}
          >
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", meta.dot)}
            />
            {meta.label}
          </span>
        </div>

        {/* Success rate ------------------------------------------------ */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Success rate
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {totalRequests === 0
                ? "—"
                : `${rate.toFixed(rate < 10 ? 1 : 0)}%`}
            </span>
          </div>
          <Progress
            value={rate}
            className={cn("h-1.5", progressColor(rate))}
            aria-label={`Success rate ${rate.toFixed(0)}%`}
          />
          <p className="text-[10px] text-muted-foreground">
            {totalRequests === 0
              ? "No requests recorded yet"
              : `${entry.success_count.toLocaleString()} ok · ${entry.error_count.toLocaleString()} errors`}
          </p>
        </div>

        {/* Latency + last check ---------------------------------------- */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Zap className="size-3" aria-hidden="true" />
              Avg latency
            </p>
            <p className="text-sm font-medium tabular-nums">
              {entry.avg_latency_ms !== null
                ? `${Math.round(entry.avg_latency_ms).toLocaleString()} ms`
                : "—"}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Clock className="size-3" aria-hidden="true" />
              Last check
            </p>
            <p className="text-sm font-medium">
              {entry.last_check_at ? (
                <span title={entry.last_check_at}>
                  {formatRelativeTime(entry.last_check_at)}
                </span>
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>

        {/* Last error (truncated + tooltip for full text) -------------- */}
        {hasLastError ? (
          <div className="flex items-start gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5">
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0 text-destructive dark:text-red-400"
              aria-hidden="true"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="line-clamp-2 text-xs text-destructive dark:text-red-400 text-pretty">
                  {lastErrorTruncated}
                </p>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-xs text-balance"
              >
                {entry.last_error}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-start gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5">
            <span
              className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8.5L6.5 12L13 4.5" />
              </svg>
            </span>
            <p className="text-xs text-muted-foreground">
              No recent errors
            </p>
          </div>
        )}

        {/* Request count footer ---------------------------------------- */}
        <div className="flex items-center justify-between border-t pt-2 text-[10px] text-muted-foreground">
          <span>Total requests</span>
          <span className="tabular-nums font-medium">
            {totalRequests.toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Provider icon medallion
// ---------------------------------------------------------------------------

/** Provider → background gradient for the medallion. NO indigo/blue. */
const PROVIDER_MEDALLION: Record<string, string> = {
  openai: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  anthropic: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  google: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  openrouter: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  deepseek: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  qwen: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  grok: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
};

/** Single-letter medallion for a provider (e.g. "O" for OpenAI). */
function ProviderIcon({ provider }: { provider: string }) {
  const initial = provider.charAt(0).toUpperCase();
  const colorClass =
    PROVIDER_MEDALLION[provider] ?? "bg-muted text-foreground";
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
        colorClass,
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
