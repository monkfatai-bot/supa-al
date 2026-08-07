"use client";

/**
 * Supa AI — Phase 10 Integration Hub — analytics dashboard.
 *
 * Aggregated analytics: KPI tiles + per-integration rows from the
 * `integration_analytics` table.
 *
 * @module @/components/integrations/analytics-dashboard
 */
import * as React from "react";
import {
  BarChart3,
  Activity,
  AlertCircle,
  RefreshCw,
  Webhook,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useIntegrationAnalytics } from "@/hooks/use-integrations";
import { cn } from "@/lib/utils";

interface AnalyticsDashboardProps {
  workspaceId: string;
}

export function AnalyticsDashboard({ workspaceId }: AnalyticsDashboardProps) {
  const query = useIntegrationAnalytics({ workspaceId, limit: 100 });

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
        icon={BarChart3}
        title="Couldn't load analytics"
        description="Please try again later."
      />
    );
  }
  const summary = query.data;
  if (!summary || summary.rows.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No analytics yet"
        description="Connect an integration and run a sync to see analytics here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi
          label="API calls"
          value={summary.totalApiCalls}
          icon={Activity}
          tone="emerald"
        />
        <Kpi
          label="API errors"
          value={summary.totalApiErrors}
          icon={AlertCircle}
          tone={summary.totalApiErrors > 0 ? "red" : "muted"}
        />
        <Kpi
          label="Sync runs"
          value={summary.totalSyncRuns}
          icon={RefreshCw}
        />
        <Kpi
          label="Records synced"
          value={summary.totalRecordsSynced}
          icon={RefreshCw}
        />
        <Kpi
          label="Webhooks received"
          value={summary.totalWebhooksReceived}
          icon={Webhook}
        />
        <Kpi
          label="Webhooks delivered"
          value={summary.totalWebhooksDelivered}
          icon={Webhook}
          tone="emerald"
        />
        <Kpi
          label="Rate-limit hits"
          value={summary.totalRateLimitHits}
          icon={AlertCircle}
          tone={summary.totalRateLimitHits > 0 ? "amber" : "muted"}
        />
        <Kpi
          label="Avg error rate"
          value={`${(summary.avgErrorRate * 100).toFixed(2)}%`}
          icon={BarChart3}
          tone={summary.avgErrorRate > 0.05 ? "red" : "muted"}
        />
      </div>

      {/* Per-integration rows */}
      <div className="rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-2 text-left font-medium">Integration</th>
              <th className="p-2 text-right font-medium">Date</th>
              <th className="p-2 text-right font-medium">Calls</th>
              <th className="p-2 text-right font-medium">Errors</th>
              <th className="p-2 text-right font-medium">Sync</th>
              <th className="p-2 text-right font-medium">Records</th>
              <th className="p-2 text-right font-medium">WH in/out</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {summary.rows.map((row) => (
              <tr key={row.integrationId}>
                <td className="p-2">{row.connectorKey}</td>
                <td className="p-2 text-right">{row.name}</td>
                <td className="p-2 text-right">{row.apiCalls}</td>
                <td className="p-2 text-right">{row.apiErrors}</td>
                <td className="p-2 text-right">{row.syncRuns}</td>
                <td className="p-2 text-right">{row.avgLatencyMs}ms</td>
                <td className="p-2 text-right">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: number | string;
  icon: typeof BarChart3;
  tone?: "emerald" | "amber" | "red" | "muted" | "default";
}

function Kpi({ label, value, icon: Icon, tone = "default" }: KpiProps) {
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
        <Icon className={cn("size-4", toneClass[tone])} aria-hidden="true" />
      </div>
      <p className={cn("mt-1 text-2xl font-semibold", toneClass[tone])}>
        {value}
      </p>
    </div>
  );
}
