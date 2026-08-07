"use client";

/**
 * Supa AI — Phase 10 Integration Hub — health dashboard.
 *
 * Aggregated health snapshot: counts by status + per-integration
 * breakdown with status badge + latency + last-check timestamp.
 *
 * @module @/components/integrations/health-dashboard
 */
import * as React from "react";
import { Heart, Activity, AlertTriangle, XCircle, HelpCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useHealthDashboard } from "@/hooks/use-integrations";
import { cn } from "@/lib/utils";

interface HealthDashboardProps {
  workspaceId: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  healthy: "default",
  degraded: "secondary",
  down: "destructive",
  unknown: "outline",
};

const STATUS_ICON: Record<string, typeof Heart> = {
  healthy: Heart,
  degraded: AlertTriangle,
  down: XCircle,
  unknown: HelpCircle,
};

export function HealthDashboard({ workspaceId }: HealthDashboardProps) {
  const query = useHealthDashboard(workspaceId);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <EmptyState
        icon={Heart}
        title="Couldn't load health dashboard"
        description="Please try again later."
      />
    );
  }
  const summary = query.data;
  if (!summary || summary.total === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="No integrations yet"
        description="Connect an integration from the marketplace to see its health here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryTile label="Total" value={summary.total} icon={Activity} />
        <SummaryTile
          label="Healthy"
          value={summary.healthy}
          icon={Heart}
          tone="emerald"
        />
        <SummaryTile
          label="Degraded"
          value={summary.degraded}
          icon={AlertTriangle}
          tone="amber"
        />
        <SummaryTile
          label="Down"
          value={summary.down}
          icon={XCircle}
          tone="red"
        />
        <SummaryTile
          label="Unknown"
          value={summary.unknown}
          icon={HelpCircle}
          tone="muted"
        />
      </div>

      {/* Per-integration breakdown */}
      <ul className="divide-y rounded-md border">
        {summary.integrations.map((row) => {
          const Icon = STATUS_ICON[row.healthStatus] ?? HelpCircle;
          return (
            <li key={row.integrationId} className="flex items-center gap-3 p-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.connectorKey} ·{" "}
                  {row.latencyMs !== null ? `${row.latencyMs}ms` : "no data"}
                  {row.lastCheckAt
                    ? ` · ${new Date(row.lastCheckAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[row.healthStatus] ?? "outline"}>
                {row.healthStatus}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface SummaryTileProps {
  label: string;
  value: number;
  icon: typeof Heart;
  tone?: "emerald" | "amber" | "red" | "muted" | "default";
}

function SummaryTile({ label, value, icon: Icon, tone = "default" }: SummaryTileProps) {
  const toneClass: Record<string, string> = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
    muted: "text-muted-foreground",
    default: "text-foreground",
  };
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon
          className={cn("size-4", toneClass[tone])}
          aria-hidden="true"
        />
      </div>
      <p className={cn("mt-1 text-2xl font-semibold", toneClass[tone])}>
        {value}
      </p>
    </div>
  );
}
