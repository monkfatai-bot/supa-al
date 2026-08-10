"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  listCapabilities,
  discoverProviders,
  selectBestProvider,
  getFallbackProviders,
  getProviderRecommendations,
  explainProviderSelection,
} from "@/services/integration-hub";
import type {
  ServiceResult,
  ProviderCandidate,
  ProviderRecommendation,
  SelectionExplanation,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Zap,
  Activity,
  Timer,
  BarChart3,
  TrendingUp,
  Star,
  RefreshCw,
  Lightbulb,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface Capability {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-600";
  if (score >= 0.5) return "text-amber-500";
  return "text-red-500";
}

function pct(v: number): string {
  return (v * 100).toFixed(1);
}

// ─── Component ──────────────────────────────────────────────────

export default function AIProvidersPage() {
  const { workspace, isLoading: wsLoading } = useWorkspace();

  // Capabilities
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [selectedCapability, setSelectedCapability] = useState<string>("");
  const [loadingCaps, setLoadingCaps] = useState(true);

  // Provider data
  const [primary, setPrimary] = useState<ProviderCandidate | null>(null);
  const [fallbacks, setFallbacks] = useState<ProviderCandidate[]>([]);
  const [allProviders, setAllProviders] = useState<ProviderCandidate[]>([]);
  const [explanation, setExplanation] = useState<SelectionExplanation | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);

  // Recommendations
  const [recommendations, setRecommendations] = useState<ProviderRecommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(true);

  // Fetch AI capabilities
  const fetchCapabilities = useCallback(async () => {
    setLoadingCaps(true);
    try {
      const result = await listCapabilities({ category: "ai" });
      if (result.success && result.data) {
        const aiCaps = result.data as Capability[];
        setCapabilities(aiCaps);
        if (aiCaps.length > 0) {
          setSelectedCapability(aiCaps[0].slug);
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingCaps(false);
    }
  }, []);

  // Fetch recommendations
  const fetchRecommendations = useCallback(async () => {
    if (!workspace?.id) return;
    setLoadingRecs(true);
    try {
      const result: ServiceResult<ProviderRecommendation[]> =
        await getProviderRecommendations(workspace.id);
      if (result.success && result.data) {
        setRecommendations(result.data);
      }
    } catch {
      // silent
    } finally {
      setLoadingRecs(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchCapabilities();
    fetchRecommendations();
  }, [fetchCapabilities, fetchRecommendations]);

  // Fetch providers for selected capability
  const fetchProviders = useCallback(async () => {
    if (!workspace?.id || !selectedCapability) return;
    setLoadingProviders(true);
    setExplanation(null);
    setExplanationOpen(false);
    try {
      const [discoverRes, bestRes] = await Promise.all([
        discoverProviders(selectedCapability, workspace.id),
        selectBestProvider(selectedCapability, workspace.id),
      ]);

      if (discoverRes.success && discoverRes.data) {
        setAllProviders(discoverRes.data);
      }

      if (bestRes.success && bestRes.data) {
        setPrimary(bestRes.data);
        // Fetch fallbacks
        const fbResult = await getFallbackProviders(
          selectedCapability,
          workspace.id,
          bestRes.data.integrationId
        );
        if (fbResult.success && fbResult.data) {
          setFallbacks(fbResult.data);
        } else {
          setFallbacks([]);
        }
      } else {
        setPrimary(null);
        setFallbacks([]);
      }
    } catch {
      toast.error("Failed to load provider data");
    } finally {
      setLoadingProviders(false);
    }
  }, [workspace?.id, selectedCapability]);

  useEffect(() => {
    if (selectedCapability) {
      fetchProviders();
    }
  }, [selectedCapability, fetchProviders]);

  const handleExplain = useCallback(async () => {
    if (!workspace?.id || !selectedCapability) return;
    setExplanationOpen((prev) => !prev);
    if (explanation) return;
    try {
      const result = await explainProviderSelection(
        selectedCapability,
        workspace.id
      );
      if (result.success && result.data) {
        setExplanation(result.data);
      } else {
        toast.error(result.message || "Failed to explain selection");
      }
    } catch {
      toast.error("Something went wrong");
    }
  }, [workspace?.id, selectedCapability, explanation]);

  // Unique capabilities from recommendations
  const recCapabilities = useMemo(() => {
    const seen = new Set<string>();
    return recommendations.filter((r) => {
      if (seen.has(r.capability_slug)) return false;
      seen.add(r.capability_slug);
      return true;
    });
  }, [recommendations]);

  if (wsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          AI Provider Intelligence
        </h1>
        <p className="text-muted-foreground">
          Discover, compare, and optimize AI provider selection for each
          capability.
        </p>
      </div>

      {/* Capability Selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Capability:</span>
        </div>
        {loadingCaps ? (
          <Skeleton className="h-9 w-64" />
        ) : capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No AI capabilities found.
          </p>
        ) : (
          <Select
            value={selectedCapability}
            onValueChange={setSelectedCapability}
          >
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select a capability…" />
            </SelectTrigger>
            <SelectContent>
              {capabilities.map((cap) => (
                <SelectItem key={cap.slug} value={cap.slug}>
                  {cap.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Provider Content */}
      {selectedCapability && (
        <>
          {loadingProviders ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Primary Provider Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Primary Provider
                  </CardTitle>
                  <CardDescription>
                    Best-scoring provider for this capability.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {primary ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                          {primary.integrationName}
                        </h3>
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Priority #1
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Activity className="h-3 w-3" />
                            Health Score
                          </div>
                          <span className={`text-xl font-bold ${scoreColor(primary.healthScore / 100)}`}>
                            {primary.healthScore}
                          </span>
                        </div>
                        <div className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <BarChart3 className="h-3 w-3" />
                            Confidence
                          </div>
                          <span className={`text-xl font-bold ${scoreColor(primary.confidenceScore)}`}>
                            {pct(primary.confidenceScore)}
                          </span>
                        </div>
                        <div className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <TrendingUp className="h-3 w-3" />
                            Success Rate
                          </div>
                          <span className="text-xl font-bold">
                            {pct(primary.successRate)}
                          </span>
                        </div>
                        <div className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Timer className="h-3 w-3" />
                            Avg Latency
                          </div>
                          <span className="text-xl font-bold">
                            {primary.avgLatencyMs}ms
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Usage count: <span className="font-medium text-foreground">{primary.usageCount}</span>
                      </p>

                      {/* Explain Selection */}
                      <Collapsible open={explanationOpen} onOpenChange={setExplanationOpen}>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={handleExplain}
                          >
                            <Lightbulb className="h-4 w-4 mr-2" />
                            Explain Selection
                            {explanationOpen ? (
                              <ChevronUp className="h-4 w-4 ml-auto" />
                            ) : (
                              <ChevronDown className="h-4 w-4 ml-auto" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3">
                          {explanation ? (
                            <div className="rounded-lg border p-4 space-y-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">Selected: </span>
                                <span className="font-medium">
                                  {explanation.selectedProvider?.integrationName ?? "None"}
                                </span>
                                {explanation.selectedProvider && (
                                  <span className="text-muted-foreground">
                                    {" "}(score: {explanation.selectedProvider.compositeScore.toFixed(3)})
                                  </span>
                                )}
                              </div>
                              <Separator />
                              <div className="font-medium">Scoring Weights</div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>Health: {pct(explanation.weights.health)}</div>
                                <div>Success: {pct(explanation.weights.success)}</div>
                                <div>Latency: {pct(explanation.weights.latency)}</div>
                                <div>Usage: {pct(explanation.weights.usage)}</div>
                              </div>
                              {explanation.candidates.length > 0 && (
                                <>
                                  <Separator />
                                  <div className="font-medium">All Candidates</div>
                                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                                    {explanation.candidates.map((c) => (
                                      <div
                                        key={c.integrationId}
                                        className={`flex items-center justify-between rounded p-2 text-xs ${c.excluded ? "opacity-50" : ""}`}
                                      >
                                        <span>{c.integrationName}</span>
                                        <div className="flex items-center gap-2">
                                          <span>Score: {c.compositeScore.toFixed(3)}</span>
                                          {c.excluded && (
                                            <Badge variant="destructive" className="text-[10px] px-1.5">
                                              {c.reason}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Skeleton className="h-6 w-full" />
                              <Skeleton className="h-6 w-3/4" />
                              <Skeleton className="h-6 w-1/2" />
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Zap className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">No eligible primary provider found.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Fallback Providers */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <RefreshCw className="h-4 w-4" />
                    Fallback Providers
                  </CardTitle>
                  <CardDescription>
                    Ranked alternatives when the primary is unavailable.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {fallbacks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <RefreshCw className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">No fallback providers available.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {fallbacks.map((fb, idx) => (
                        <div
                          key={fb.integrationId}
                          className="rounded-lg border p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">
                              {fb.integrationName}
                            </span>
                            <Badge variant="outline">
                              #{idx + 2}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Health: </span>
                              <span className={scoreColor(fb.healthScore / 100)}>{fb.healthScore}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Confidence: </span>
                              <span>{pct(fb.confidenceScore)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Success: </span>
                              <span>{pct(fb.successRate)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Latency: </span>
                              <span>{fb.avgLatencyMs}ms</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* All Providers Comparison Table */}
          {allProviders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  All Providers Comparison
                </CardTitle>
                <CardDescription>
                  Side-by-side metrics for all providers of this capability.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Fallback</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Success Rate</TableHead>
                        <TableHead>Avg Latency</TableHead>
                        <TableHead className="text-right">Usage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allProviders.map((p) => {
                        const isPrimary = primary?.integrationId === p.integrationId;
                        const isFallback = fallbacks.some(
                          (f) => f.integrationId === p.integrationId
                        );
                        return (
                          <TableRow
                            key={p.integrationId}
                            className={isPrimary ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {p.integrationName}
                                {isPrimary && (
                                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {isPrimary ? (
                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                  Primary
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isFallback ? (
                                <Badge variant="outline">Fallback</Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className={scoreColor(p.confidenceScore)}>
                                {pct(p.confidenceScore)}
                              </span>
                            </TableCell>
                            <TableCell>{pct(p.successRate)}</TableCell>
                            <TableCell>{p.avgLatencyMs}ms</TableCell>
                            <TableCell className="text-right">
                              {p.usageCount}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4" />
          Top Recommendations
        </CardTitle>
          <CardDescription>
            Highest confidence providers across all AI capabilities for your
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRecs ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recCapabilities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Lightbulb className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">
                No recommendations yet. Start using AI capabilities to generate
                insights.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-3">
              {recCapabilities.slice(0, 10).map((rec) => (
                <div
                  key={`${rec.capability_slug}-${rec.integration_id}`}
                  className="rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="capitalize">
                          {rec.capability_slug.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Integration: {rec.integration_id.slice(0, 12)}…
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Confidence</div>
                        <div className={`font-bold ${scoreColor(rec.confidence_score)}`}>
                          {pct(rec.confidence_score)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Success</div>
                        <div className="font-medium">
                          {rec.usage_count > 0
                            ? pct(rec.success_count / rec.usage_count)
                            : "—"}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Avg Time</div>
                        <div className="font-medium">
                          {rec.avg_response_ms}ms
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Usage</div>
                        <div className="font-medium">{rec.usage_count}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
