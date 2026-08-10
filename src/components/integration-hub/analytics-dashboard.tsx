"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarDays,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getUsageAnalytics,
  getIntegrationLogs,
} from "@/services/integration-hub/actions";
import type {
  ServiceResult,
  UsageStats,
  IntegrationLogEntry,
} from "@/services/integration-hub/types";

// ── Date helpers ─────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Props ────────────────────────────────────────────────────────

interface AnalyticsDashboardProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────

export function AnalyticsDashboard({ workspaceId }: AnalyticsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState(7);
  const [_usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [logs, setLogs] = useState<IntegrationLogEntry[]>([]);

  const startDate = useMemo(() => daysAgo(activePreset), [activePreset]);
  const endDate = new Date().toISOString();

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      getUsageAnalytics({ workspaceId, startDate, endDate }).then(
        (res: ServiceResult<UsageStats>) => {
          if (res.success && res.data) setUsageStats(res.data);
        }
      ),
      getIntegrationLogs({ workspaceId, limit: 500, offset: 0 }).then(
        (res: ServiceResult<IntegrationLogEntry[]>) => {
          if (res.success && res.data) setLogs(res.data);
        }
      ),
    ]).finally(() => setLoading(false));
  }, [workspaceId, startDate, endDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // ── Computed aggregates from logs ───────────────────────────────

  const computed = useMemo(() => {
    const filtered = logs.filter((l) => {
      const logDate = new Date(l.created_at).getTime();
      const start = new Date(startDate).getTime();
      return logDate >= start;
    });

    const totalEvents = filtered.length;
    const successCount = filtered.filter((l) => l.status === "success").length;
    const errorCount = filtered.filter((l) => l.status === "error").length;
    const timeoutCount = filtered.filter((l) => l.status === "timeout").length;
    const successRate = totalEvents > 0 ? (successCount / totalEvents) * 100 : 0;
    const avgLatency =
      filtered.length > 0
        ? filtered.reduce((sum, l) => sum + (l.duration_ms ?? 0), 0) / filtered.length
        : 0;

    // Daily volume (bar chart data)
    const dayMap = new Map<string, { success: number; error: number; timeout: number }>();
    for (const l of filtered) {
      const day = new Date(l.created_at).toISOString().slice(0, 10);
      const bucket = dayMap.get(day) ?? { success: 0, error: 0, timeout: 0 };
      if (l.status === "success") bucket.success++;
      else if (l.status === "error") bucket.error++;
      else if (l.status === "timeout") bucket.timeout++;
      dayMap.set(day, bucket);
    }
    const dailyVolume = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-Math.min(activePreset, 30))
      .map(([date, counts]) => ({ date, ...counts }));

    const maxDaily = Math.max(...dailyVolume.map((d) => d.success + d.error + d.timeout), 1);

    // By integration (horizontal bars)
    const intMap = new Map<string, { name: string; total: number; success: number; error: number; avgMs: number; lastUsed: string }>();
    for (const l of filtered) {
      const key = l.integration_id ?? "unknown";
      const bucket = intMap.get(key) ?? { name: l.integrationName ?? key, total: 0, success: 0, error: 0, avgMs: 0, lastUsed: "" };
      bucket.total++;
      if (l.status === "success") bucket.success++;
      else if (l.status === "error") bucket.error++;
      if (l.duration_ms != null) {
        bucket.avgMs = (bucket.avgMs * (bucket.total - 1) + l.duration_ms) / bucket.total;
      }
      if (!bucket.lastUsed || l.created_at > bucket.lastUsed) {
        bucket.lastUsed = l.created_at;
      }
      intMap.set(key, bucket);
    }
    const byIntegration = Array.from(intMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    const maxIntTotal = Math.max(...byIntegration.map((i) => i.total), 1);

    // By status (pie approximation)
    const statusCounts = { success: successCount, error: errorCount, timeout: timeoutCount };

    // Error rate trend (daily)
    const errorTrend = dailyVolume.map((d) => {
      const total = d.success + d.error + d.timeout;
      return { date: d.date, rate: total > 0 ? ((d.error + d.timeout) / total) * 100 : 0 };
    });

    return {
      totalEvents,
      successCount,
      errorCount,
      timeoutCount,
      successRate,
      avgLatency,
      dailyVolume,
      maxDaily,
      byIntegration,
      maxIntTotal,
      statusCounts,
      errorTrend,
    };
  }, [logs, startDate, activePreset]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h2>
          <p className="text-muted-foreground text-sm">
            Monitor integration usage and performance
          </p>
        </div>
        <div className="flex gap-2">
          {DATE_PRESETS.map((p) => (
            <Button
              key={p.label}
              variant={activePreset === p.days ? "default" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => setActivePreset(p.days)}
            >
              <CalendarDays className="mr-1.5 h-3 w-3" />
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Stats Row ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{computed.totalEvents.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={`text-2xl font-bold ${computed.successRate >= 95 ? "text-emerald-600" : computed.successRate >= 80 ? "text-amber-600" : "text-red-600"}`}>
                {computed.successRate.toFixed(1)}%
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{formatMs(computed.avgLatency)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Count</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={`text-2xl font-bold ${computed.errorCount > 0 ? "text-red-600" : ""}`}>
                {computed.errorCount.toLocaleString()}
                {computed.timeoutCount > 0 && (
                  <span className="text-base font-normal text-amber-600 ml-1">
                    +{computed.timeoutCount} timeout
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-6 w-full" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : computed.totalEvents === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="text-muted-foreground mb-3 h-10 w-10" />
          <h3 className="text-lg font-medium">No events recorded</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Integration analytics will appear once events are logged.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Event Volume Bar Chart ────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Event Volume Over Time</CardTitle>
              <CardDescription>Daily event counts</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-64">
                <div className="flex flex-col gap-1.5">
                  {computed.dailyVolume.map((d) => {
                    const total = d.success + d.error + d.timeout;
                    const successW = (d.success / computed.maxDaily) * 100;
                    const errorW = (d.error / computed.maxDaily) * 100;
                    return (
                      <div key={d.date} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground w-12 shrink-0 text-right">
                          {formatDateShort(d.date)}
                        </span>
                        <div className="flex flex-1 h-5 gap-px">
                          <div
                            className="bg-primary rounded-sm h-full transition-all"
                            style={{ width: `${successW}%` }}
                            title={`${d.success} success`}
                          />
                          <div
                            className="bg-destructive rounded-sm h-full transition-all"
                            style={{ width: `${errorW}%` }}
                            title={`${d.error} errors`}
                          />
                        </div>
                        <span className="text-muted-foreground w-10 text-right shrink-0">
                          {total}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* ── Events by Integration (horizontal bars) ──────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Events by Integration</CardTitle>
              <CardDescription>Distribution across integrations</CardDescription>
            </CardHeader>
            <CardContent>
              {computed.byIntegration.length > 0 ? (
                <div className="space-y-2">
                  {computed.byIntegration.map((integ) => {
                    const w = (integ.total / computed.maxIntTotal) * 100;
                    return (
                      <div key={integ.name} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate max-w-[120px] font-medium">{integ.name}</span>
                          <span className="text-muted-foreground">{integ.total}</span>
                        </div>
                        <div className="h-4 w-full rounded bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded transition-all"
                            style={{ width: `${w}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-8">No data</p>
              )}
            </CardContent>
          </Card>

          {/* ── Events by Status (pie approximation) ──────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Events by Status</CardTitle>
              <CardDescription>Status distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-4 border-muted relative">
                  <div className="text-center">
                    <div className="text-lg font-bold">{computed.totalEvents}</div>
                    <div className="text-[10px] text-muted-foreground">total</div>
                  </div>
                </div>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span>Success</span>
                    <span className="ml-auto font-medium">{computed.statusCounts.success}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <span>Error</span>
                    <span className="ml-auto font-medium">{computed.statusCounts.error}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-amber-500" />
                    <span>Timeout</span>
                    <span className="ml-auto font-medium">{computed.statusCounts.timeout}</span>
                  </div>
                  {/* stacked bar */}
                  <div className="mt-1 flex h-3 w-full overflow-hidden rounded-full">
                    {computed.totalEvents > 0 && (
                      <>
                        <div
                          className="bg-emerald-500 transition-all"
                          style={{ width: `${(computed.statusCounts.success / computed.totalEvents) * 100}%` }}
                        />
                        <div
                          className="bg-red-500 transition-all"
                          style={{ width: `${(computed.statusCounts.error / computed.totalEvents) * 100}%` }}
                        />
                        <div
                          className="bg-amber-500 transition-all"
                          style={{ width: `${(computed.statusCounts.timeout / computed.totalEvents) * 100}%` }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Error Rate Trend (line approximation) ─────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Error Rate Trend</CardTitle>
              <CardDescription>Daily error rate %</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-64">
                <div className="flex items-end gap-1 h-40">
                  {computed.errorTrend.map((d) => {
                    const h = Math.max(d.rate, 0.5);
                    return (
                      <div
                        key={d.date}
                        className="flex flex-1 flex-col items-center justify-end h-full"
                      >
                        <span className="text-[10px] text-muted-foreground mb-1">
                          {d.rate.toFixed(0)}%
                        </span>
                        <div
                          className={`w-full rounded-t transition-all ${d.rate > 10 ? "bg-red-500" : d.rate > 5 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ height: `${Math.min((h / 100) * 100, 100)}%`, minHeight: "2px" }}
                        />
                        <span className="text-[9px] text-muted-foreground mt-1 rotate-0">
                          {formatDateShort(d.date)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Top Integrations Table ────────────────────────────── */}
      {!loading && computed.byIntegration.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Integrations</CardTitle>
            <CardDescription>Performance breakdown by integration</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Integration</TableHead>
                    <TableHead className="text-xs text-right">Events</TableHead>
                    <TableHead className="text-xs text-right">Success Rate</TableHead>
                    <TableHead className="text-xs text-right">Avg Latency</TableHead>
                    <TableHead className="text-xs text-right">Last Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computed.byIntegration.map((integ) => (
                    <TableRow key={integ.name}>
                      <TableCell className="text-xs font-medium">{integ.name}</TableCell>
                      <TableCell className="text-xs text-right">{integ.total.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">
                        <span className={integ.total > 0 && (integ.success / integ.total) * 100 >= 95 ? "text-emerald-600" : "text-amber-600"}>
                          {integ.total > 0 ? ((integ.success / integ.total) * 100).toFixed(1) : 0}%
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-right">{formatMs(integ.avgMs)}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">
                        {integ.lastUsed ? formatDateShort(integ.lastUsed) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
