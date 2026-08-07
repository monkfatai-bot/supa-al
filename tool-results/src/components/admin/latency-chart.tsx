"use client";

/**
 * Supa AI — Latency chart (admin overview).
 *
 * Recharts bar chart showing the average response latency (ms) per
 * provider, sourced from `/api/chat/health` (`avg_latency_ms`). Mobile-
 * friendly via `ResponsiveContainer`; dark-mode compatible via CSS
 * variables (chart colors reference `hsl(var(--chart-*))` via Tailwind
 * tokens that resolve to the same palette in both themes).
 *
 * HONEST CAVEAT: providers with no recorded requests (`avg_latency_ms
 * === null`) are rendered as zero-height bars with a muted color and a
 * "—" tooltip — they are not silently dropped, because an admin looking
 * at the chart should immediately see "this provider has no data yet"
 * rather than wondering where the bar went.
 *
 * @module @/components/admin/latency-chart
 */
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Separator } from "@/components/ui/separator";
import type { ProviderHealthEntry } from "@/hooks/use-admin";

export interface LatencyChartProps {
  /** Health rows from `/api/chat/health`. */
  providers: ProviderHealthEntry[];
  className?: string;
}

/** Chart datum: provider name + (possibly null) latency. */
interface LatencyDatum {
  provider: string;
  /** The raw latency in ms, or `null` when no data. Recharts can't render null bars. */
  latency: number;
  /** Original `avg_latency_ms` value (kept for tooltip rendering). */
  raw: number | null;
}

/** Emerald-tinted bar color (light + dark compatible). */
const BAR_FILL = "hsl(var(--chart-2, 142 71% 45%))";
/** Muted bar color for providers with no data. */
const BAR_FILL_EMPTY = "hsl(var(--muted-foreground, 220 9% 46%) / 0.25)";

/** Custom tooltip — renders "—" when latency is null. */
function LatencyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: LatencyDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{datum.provider}</p>
      <p className="text-muted-foreground">
        Avg latency:{" "}
        <span className="font-medium tabular-nums text-foreground">
          {datum.raw === null ? "—" : `${Math.round(datum.raw).toLocaleString()} ms`}
        </span>
      </p>
    </div>
  );
}

export function LatencyChart({ providers, className }: LatencyChartProps) {
  // Sort by latency desc (nulls last) so the chart reads "worst offender
  // first" — the admin's eye lands on the slowest provider immediately.
  const data: LatencyDatum[] = React.useMemo(() => {
    return providers
      .map((p) => ({
        provider: p.provider,
        latency: p.avg_latency_ms ?? 0,
        raw: p.avg_latency_ms,
      }))
      .sort((a, b) => {
        if (a.raw === null && b.raw === null) return a.provider.localeCompare(b.provider);
        if (a.raw === null) return 1;
        if (b.raw === null) return -1;
        return b.raw - a.raw;
      });
  }, [providers]);

  const hasAnyData = data.some((d) => d.raw !== null);
  const maxLatency = data.reduce((m, d) => Math.max(m, d.raw ?? 0), 0);

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Provider latency</h4>
          <p className="text-xs text-muted-foreground">
            Rolling average response time per provider (ms).
          </p>
        </div>
        {maxLatency > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            peak {Math.round(maxLatency).toLocaleString()} ms
          </p>
        ) : null}
      </div>
      <Separator className="mb-3" />
      {!hasAnyData ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          No latency data yet — providers will appear here after the first AI request.
        </div>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border, 220 13% 91%))"
                strokeOpacity={0.5}
                vertical={false}
              />
              <XAxis
                dataKey="provider"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground, 220 9% 46%))" }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={48}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground, 220 9% 46%))" }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
                }
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted-foreground, 220 9% 46%) / 0.08)" }}
                content={<LatencyTooltip />}
              />
              <Bar dataKey="latency" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {data.map((d) => (
                  <Cell
                    key={d.provider}
                    fill={d.raw === null ? BAR_FILL_EMPTY : BAR_FILL}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
