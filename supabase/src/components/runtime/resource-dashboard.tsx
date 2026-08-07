"use client";

/**
 * Supa AI — Phase 12 Runtime — resource dashboard.
 *
 * Aggregated view of the workspace's runtime resource utilization:
 *
 *   - Token budget (used / total).
 *   - Credit budget (used / total).
 *   - Concurrent executions (current / max).
 *   - Per-resource-type breakdown with utilization bars.
 *
 * Pulls the {@link ResourceSummary} from
 * `/api/v1/runtime/resources/summary` and the raw {@link RuntimeResource}
 * list from `/api/v1/runtime/resources`.
 *
 * @module @/components/runtime/resource-dashboard
 */
import * as React from "react";
import {
  Cpu,
  GaugeCircle,
  Coins,
  Layers,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ResourceSummary } from "@/lib/runtime/types";
import {
  useRuntimeResourceSummary,
  useRuntimeResources,
} from "@/hooks/use-runtime";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { humanize } from "./status-styles";

export interface ResourceDashboardProps {
  workspaceId: string;
  className?: string;
}

export function ResourceDashboard({
  workspaceId,
  className,
}: ResourceDashboardProps) {
  const summaryQuery = useRuntimeResourceSummary(workspaceId);
  const resourcesQuery = useRuntimeResources(workspaceId);

  if (summaryQuery.isLoading || resourcesQuery.isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <div className={cn(className)}>
        <EmptyState
          icon={GaugeCircle}
          title="Couldn't load resources"
          description="Please try again later."
        />
      </div>
    );
  }

  const summary: ResourceSummary = summaryQuery.data;
  const tokenPct =
    summary.total_token_budget > 0
      ? Math.round(
          (summary.total_token_used / summary.total_token_budget) * 100,
        )
      : 0;
  const creditPct =
    summary.total_credit_budget > 0
      ? Math.round(
          (summary.total_credit_used / summary.total_credit_budget) * 100,
        )
      : 0;
  const concurrentPct =
    summary.max_concurrent > 0
      ? Math.round(
          (summary.current_concurrent / summary.max_concurrent) * 100,
        )
      : 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BudgetCard
          label="Token budget"
          icon={Zap}
          used={summary.total_token_used}
          budget={summary.total_token_budget}
          pct={tokenPct}
        />
        <BudgetCard
          label="Credit budget"
          icon={Coins}
          used={summary.total_credit_used}
          budget={summary.total_credit_budget}
          pct={creditPct}
        />
        <BudgetCard
          label="Concurrent executions"
          icon={Cpu}
          used={summary.current_concurrent}
          budget={summary.max_concurrent}
          pct={concurrentPct}
          unit=""
        />
      </div>

      <SectionCard
        title="Per-resource breakdown"
        description="Every runtime resource tracked for this workspace — tokens, credits, concurrent slots, and rate limits."
        icon={Layers}
        contentClassName="p-0"
      >
        {resourcesQuery.isError || !resourcesQuery.data || resourcesQuery.data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Layers}
              title="No resource records"
              description="Resource entries (per-provider quota, rate limits, concurrent slots) will appear here once the runtime starts tracking them."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="min-w-[140px]">Utilization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resourcesQuery.data.map((r) => {
                  const pct =
                    r.limit_value > 0
                      ? Math.min(
                          100,
                          Math.round(
                            ((r.used_value + r.reserved_value) /
                              r.limit_value) *
                              100,
                          ),
                        )
                      : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wide"
                        >
                          {humanize(r.resource_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.resource_key}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.limit_value.toLocaleString()} {r.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.used_value.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.reserved_value.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <UtilizationBar pct={pct} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface BudgetCardProps {
  label: string;
  icon: typeof Zap;
  used: number;
  budget: number;
  pct: number;
  unit?: string;
}

function BudgetCard({ label, icon: Icon, used, budget, pct, unit = "" }: BudgetCardProps) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {used.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / {budget.toLocaleString()} {unit}
            </span>
          </p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3">
        <UtilizationBar pct={pct} />
      </div>
    </div>
  );
}

function UtilizationBar({ pct }: { pct: number }) {
  const tone =
    pct >= 90
      ? "bg-red-500"
      : pct >= 70
        ? "bg-amber-500"
        : "bg-emerald-600";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}
