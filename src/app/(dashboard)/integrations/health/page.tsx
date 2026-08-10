"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  getAllHealthScores,
  refreshAllHealthScores,
} from "@/services/integration-hub";
import type {
  ServiceResult,
  HealthScoreRecord,
  HealthFactors,
  HealthStatus,
} from "@/services/integration-hub";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Heart,
  AlertTriangle,
  XCircle,
  CheckCircle2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface EnrichedHealth extends HealthScoreRecord {
  integrationName: string;
}

interface FactorDisplay {
  label: string;
  key: keyof HealthFactors;
  description: string;
}

const FACTORS: FactorDisplay[] = [
  { label: "OAuth Validity", key: "oauthPenalty", description: "Token expiry and refresh status" },
  { label: "Error Rate", key: "errorRatePenalty", description: "Error rate in the last 24 hours" },
  { label: "Availability", key: "availabilityPenalty", description: "Time since last successful call" },
  { label: "Latency", key: "latencyPenalty", description: "Average response time in last 24h" },
  { label: "Rate Limits", key: "rateLimitPenalty", description: "HTTP 429 errors in last 24h" },
  { label: "Webhook Health", key: "webhookPenalty", description: "Webhook success/failure ratio" },
  { label: "Sync Status", key: "syncPenalty", description: "Last sync operation result" },
];

// ─── Helpers ────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

function progressColor(score: number): string {
  if (score >= 80) return "[&>div]:bg-emerald-500";
  if (score >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

function badgeClass(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "warning":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "critical":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "";
  }
}

function statusIcon(status: HealthStatus) {
  switch (status) {
    case "healthy":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
    case "warning":
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    case "critical":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  }
}

function penaltyToScore(penalty: number): number {
  return Math.max(0, 100 - penalty);
}

// ─── Component ──────────────────────────────────────────────────

export default function HealthPage() {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const [healthScores, setHealthScores] = useState<EnrichedHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!workspace?.id) return;
    setIsLoading(true);
    try {
      const result: ServiceResult<HealthScoreRecord[]> =
        await getAllHealthScores(workspace.id);
      if (result.success && result.data) {
        setHealthScores(
          result.data.map((r) => ({
            ...r,
            integrationName: r.integration_id.slice(0, 12) + "…",
          }))
        );
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefreshAll = useCallback(async () => {
    if (!workspace?.id) return;
    setIsRefreshing(true);
    try {
      const result = await refreshAllHealthScores(workspace.id);
      if (result.success) {
        toast.success(
          result.message || "Health scores refreshed"
        );
        await fetchData();
      } else {
        toast.error(result.message || "Failed to refresh");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsRefreshing(false);
    }
  }, [workspace?.id, fetchData]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Stats
  const { total, healthy, warning, critical } = useMemo(() => {
    const t = healthScores.length;
    const h = healthScores.filter((s) => s.status === "healthy").length;
    const w = healthScores.filter((s) => s.status === "warning").length;
    const c = healthScores.filter((s) => s.status === "critical").length;
    return { total: t, healthy: h, warning: w, critical: c };
  }, [healthScores]);

  if (wsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Integration Health
          </h1>
          <p className="text-muted-foreground">
            Monitor the health and reliability of your workspace integrations.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefreshAll}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
          />
          {isRefreshing ? "Refreshing…" : "Refresh All"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Total Integrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-emerald-600">
              <Heart className="h-3.5 w-3.5" />
              Healthy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {healthy}
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              Warning
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {warning}
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-red-500">
              <XCircle className="h-3.5 w-3.5" />
              Critical
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{critical}</div>
          </CardContent>
        </Card>
      </div>

      {/* Health Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Health Scores
          </CardTitle>
          <CardDescription>
            Click to expand detailed sub-scores for each integration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : healthScores.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <Activity className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                No health data available
              </h3>
              <p className="text-muted-foreground text-sm text-center max-w-sm">
                Health scores will appear once integrations are connected and
                have usage data.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Integration</TableHead>
                    <TableHead>Overall Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Auth</TableHead>
                    <TableHead className="hidden sm:table-cell">Latency</TableHead>
                    <TableHead className="hidden sm:table-cell">Error Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthScores.map((record) => {
                    const factors = record.factors as HealthFactors;
                    const isExpanded = expandedId === record.id;
                    return (
                      <>
                        <TableRow
                          key={record.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleExpand(record.id)}
                        >
                          <TableCell className="w-8">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {record.integrationName}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-lg font-bold ${scoreColor(record.score)}`}
                              >
                                {record.score}
                              </span>
                              <Progress
                                value={record.score}
                                className={`h-2 w-20 ${progressColor(record.score)}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={badgeClass(record.status)}
                            >
                              <span className="flex items-center gap-1">
                                {statusIcon(record.status)}
                                {record.status}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-1.5">
                              <Progress
                                value={penaltyToScore(factors.oauthPenalty)}
                                className={`h-1.5 w-16 ${progressColor(penaltyToScore(factors.oauthPenalty))}`}
                              />
                              <span className="text-xs text-muted-foreground w-7">
                                {penaltyToScore(factors.oauthPenalty)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-1.5">
                              <Progress
                                value={penaltyToScore(factors.latencyPenalty)}
                                className={`h-1.5 w-16 ${progressColor(penaltyToScore(factors.latencyPenalty))}`}
                              />
                              <span className="text-xs text-muted-foreground w-7">
                                {penaltyToScore(factors.latencyPenalty)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-1.5">
                              <Progress
                                value={penaltyToScore(factors.errorRatePenalty)}
                                className={`h-1.5 w-16 ${progressColor(penaltyToScore(factors.errorRatePenalty))}`}
                              />
                              <span className="text-xs text-muted-foreground w-7">
                                {penaltyToScore(factors.errorRatePenalty)}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <TableRow key={`${record.id}-detail`}>
                            <TableCell colSpan={7} className="bg-muted/30 px-8 py-4">
                              <div className="space-y-3">
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Detailed Sub-Scores for {record.integrationName}
                                </h4>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {FACTORS.map((f) => {
                                    const penalty = factors[f.key] as number;
                                    const subScore = penaltyToScore(penalty);
                                    return (
                                      <div
                                        key={String(f.key)}
                                        className="rounded-lg border p-3 space-y-2"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <span className="text-sm font-medium">
                                              {f.label}
                                            </span>
                                            <p className="text-xs text-muted-foreground">
                                              {f.description}
                                            </p>
                                          </div>
                                          <span
                                            className={`text-sm font-bold ${scoreColor(subScore)}`}
                                          >
                                            {subScore}
                                          </span>
                                        </div>
                                        <Progress
                                          value={subScore}
                                          className={`h-1.5 ${progressColor(subScore)}`}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Calculated at{" "}
                                  {new Date(record.calculated_at).toLocaleString()}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
