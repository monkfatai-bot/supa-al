"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GripVertical,
  Building2,
  User,
  Calendar,
  RefreshCw,
  Tag,
  TrendingUp,
  DollarSign,
  Hash,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Separator,
} from "@/components/ui/separator";
import {
  getOpportunities,
} from "@/services/crm/actions";
import type {
  OpportunityWithRelations,
  OpportunityStage,
} from "@/services/crm/types";

// ── Constants ──────────────────────────────────────────────────────

const PIPELINE_STAGES: {
  stage: OpportunityStage;
  label: string;
  color: string;
  bg: string;
  border: string;
  dotColor: string;
}[] = [
  { stage: "lead", label: "Lead", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dotColor: "bg-blue-500" },
  { stage: "qualification", label: "Qualification", color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", dotColor: "bg-indigo-500" },
  { stage: "proposal", label: "Proposal", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", dotColor: "bg-purple-500" },
  { stage: "negotiation", label: "Negotiation", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dotColor: "bg-amber-500" },
  { stage: "closed_won", label: "Closed Won", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", dotColor: "bg-green-500" },
  { stage: "closed_lost", label: "Closed Lost", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", dotColor: "bg-red-500" },
];

// Default probability weights by stage for weighted pipeline calculation
const STAGE_WEIGHTS: Record<OpportunityStage, number> = {
  lead: 0.1,
  qualification: 0.25,
  proposal: 0.5,
  negotiation: 0.75,
  closed_won: 1,
  closed_lost: 0,
};

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function daysUntilClose(expectedCloseDate: string | null): number | null {
  if (!expectedCloseDate) return null;
  const target = new Date(expectedCloseDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function daysLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d left`;
}

function daysColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 0) return "text-red-600 font-medium";
  if (days === 0) return "text-amber-600 font-medium";
  if (days <= 3) return "text-amber-600";
  return "text-muted-foreground";
}

function getProbabilityBarColor(probability: number | null): string {
  if (probability == null) return "bg-muted-foreground/30";
  if (probability >= 70) return "bg-green-500";
  if (probability >= 40) return "bg-amber-500";
  return "bg-red-400";
}

// ── Props ──────────────────────────────────────────────────────────

interface CrmPipelineProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────

export function CrmPipeline({ workspaceId }: CrmPipelineProps) {
  const [columns, setColumns] = useState<Record<OpportunityStage, OpportunityWithRelations[]>>(
    () => {
      const initial: Record<string, OpportunityWithRelations[]> = {};
      for (const s of PIPELINE_STAGES) {
        initial[s.stage] = [];
      }
      return initial as Record<OpportunityStage, OpportunityWithRelations[]>;
    },
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAllStages = useCallback((isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const stagePromises = PIPELINE_STAGES.map(({ stage }) =>
      getOpportunities({
        workspaceId,
        stage,
        page: 1,
        pageSize: 50,
      }).then((res) => {
        if (res.success && res.data) {
          return { stage, data: res.data };
        }
        return { stage, data: [] };
      }),
    );

    Promise.all(stagePromises)
      .then((results) => {
        const newColumns: Record<string, OpportunityWithRelations[]> = {};
        for (const s of PIPELINE_STAGES) {
          newColumns[s.stage] = [];
        }
        for (const r of results) {
          newColumns[r.stage] = r.data;
        }
        setColumns(newColumns as Record<OpportunityStage, OpportunityWithRelations[]>);
      })
      .catch(() => {
        setError("Failed to load pipeline data.");
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [workspaceId]);

  useEffect(() => {
    fetchAllStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // ── Computed Metrics ──────────────────────────────────────────

  const stageMetrics = PIPELINE_STAGES.map(({ stage }) => {
    const opps = columns[stage] ?? [];
    const count = opps.length;
    const value = opps.reduce((s, o) => s + o.value, 0);
    const weightedValue = opps.reduce(
      (s, o) => s + o.value * (o.probability ?? STAGE_WEIGHTS[stage]) / 100,
      0,
    );
    return { stage, count, value, weightedValue };
  });

  const totalOpps = stageMetrics.reduce((s, m) => s + m.count, 0);
  const totalPipelineValue = stageMetrics.reduce((s, m) => s + m.value, 0);
  const totalWeightedValue = stageMetrics.reduce((s, m) => s + m.weightedValue, 0);
  const wonValue = stageMetrics.find((m) => m.stage === "closed_won")?.value ?? 0;
  const lostValue = stageMetrics.find((m) => m.stage === "closed_lost")?.value ?? 0;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Sales Pipeline</h3>
            <p className="text-muted-foreground text-sm">
              {totalOpps} opportunities across 6 stages
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAllStages(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* ── Error State ──────────────────────────────────────── */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Summary Metrics Bar ──────────────────────────────── */}
        {!loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs">Total Pipeline</span>
              </div>
              <p className="mt-1 text-lg font-bold">{formatCurrency(totalPipelineValue)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">Weighted Value</span>
              </div>
              <p className="mt-1 text-lg font-bold">{formatCurrency(totalWeightedValue)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="h-4 w-4" />
                <span className="text-xs">Total Opps</span>
              </div>
              <p className="mt-1 text-lg font-bold">{totalOpps}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
              <div>
                <span className="text-green-600 text-xs font-medium">Won</span>
                <p className="text-sm font-bold">{formatCurrency(wonValue)}</p>
              </div>
              <div>
                <span className="text-red-600 text-xs font-medium">Lost</span>
                <p className="text-sm font-bold">{formatCurrency(lostValue)}</p>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* ── Loading Skeleton ──────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {PIPELINE_STAGES.map(({ stage }) => (
              <div key={stage} className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        ) : (
          /* ── Pipeline Columns ──────────────────────────────────── */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map(({ stage, label, color, bg, border, dotColor }) => {
              const opportunities = columns[stage] ?? [];
              const stageValue = opportunities.reduce((s, o) => s + o.value, 0);
              const stageWeighted = opportunities.reduce(
                (s, o) => s + o.value * (o.probability ?? STAGE_WEIGHTS[stage]) / 100,
                0,
              );

              return (
                <div
                  key={stage}
                  className={`w-72 shrink-0 rounded-xl border-2 ${border} ${bg} flex flex-col`}
                >
                  {/* Column Header */}
                  <div className={`rounded-t-xl px-4 py-3 ${bg}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                        <h4 className={`text-sm font-semibold ${color}`}>{label}</h4>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {opportunities.length}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <p className={`text-xs font-medium ${color}`}>
                        {formatCurrency(stageValue)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        W: {formatCurrency(stageWeighted)}
                      </p>
                    </div>
                  </div>

                  {/* Opportunity Cards */}
                  <div className="max-h-[600px] flex-1 overflow-y-auto p-2">
                    <div className="space-y-2">
                      {opportunities.length === 0 && (
                        <div className="py-8 text-center">
                          <p className="text-muted-foreground text-xs">No opportunities</p>
                        </div>
                      )}
                      {opportunities.map((opp) => {
                        const days = daysUntilClose(opp.expected_close_date);
                        const hasTags = opp.tags && opp.tags.length > 0;
                        return (
                          <Card key={opp.id} className="cursor-default border shadow-sm transition-shadow hover:shadow-md">
                            <CardContent className="space-y-2 p-3">
                              {/* Title */}
                              <div className="flex items-start gap-1.5">
                                <GripVertical className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <p className="line-clamp-2 text-sm font-medium leading-snug">
                                  {opp.title}
                                </p>
                              </div>

                              {/* Value */}
                              <p className="text-base font-bold">{formatCurrency(opp.value)}</p>

                              {/* Company */}
                              {opp.company && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Building2 className="h-3 w-3" />
                                  <span className="truncate text-xs">
                                    {opp.company.name}
                                  </span>
                                </div>
                              )}

                              {/* Contact Name */}
                              {opp.contact && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span className="truncate text-xs">
                                    {opp.contact.first_name} {opp.contact.last_name}
                                  </span>
                                </div>
                              )}

                              {/* Assigned To */}
                              {opp.assignee && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span className="truncate text-xs">
                                    {opp.assignee.full_name ?? "Unassigned"}
                                  </span>
                                </div>
                              )}

                              {/* Tags */}
                              {hasTags && (
                                <div className="flex flex-wrap gap-1">
                                  {opp.tags!.slice(0, 3).map((tag) => (
                                    <Badge key={tag} variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
                                      <Tag className="h-2 w-2" />
                                      {tag}
                                    </Badge>
                                  ))}
                                  {opp.tags!.length > 3 && (
                                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                      +{opp.tags!.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              )}

                              {/* Days Until Close */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className={"h-3 w-3 " + daysColor(days)} />
                                    <span className={`text-xs ${daysColor(days)}`}>
                                      {daysLabel(days)}
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                {opp.expected_close_date && (
                                  <TooltipContent>
                                    Close date: {new Date(opp.expected_close_date).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </TooltipContent>
                                )}
                              </Tooltip>

                              {/* Probability Bar */}
                              {opp.probability != null && (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Probability</span>
                                    <span>{opp.probability}%</span>
                                  </div>
                                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                                    <div
                                      className={`h-full rounded-full transition-all ${getProbabilityBarColor(opp.probability)}`}
                                      style={{ width: `${opp.probability}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pipeline Stage Summary Footer ────────────────────── */}
        {!loading && (
          <div className="rounded-lg border p-4">
            <h4 className="mb-3 text-sm font-semibold">Stage Summary</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {stageMetrics.map(({ stage, count, value, weightedValue }) => {
                const config = PIPELINE_STAGES.find((s) => s.stage === stage);
                return (
                  <div key={stage} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${config?.dotColor ?? "bg-gray-400"}`} />
                      <span className="text-xs font-medium">{config?.label ?? stage}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {count} opp &middot; {formatCurrency(value)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Weighted: {formatCurrency(weightedValue)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
