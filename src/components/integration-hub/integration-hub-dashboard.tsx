"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plug,
  Webhook,
  Key,
  Activity,
  ExternalLink,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  listConnectedAccounts,
  getUsageAnalytics,
  getIntegrationLogs,
  connectIntegration,
} from "@/services/integration-hub/actions";
import {
  listApiKeys,
} from "@/services/integration-hub/actions";
import {
  listWebhooks,
} from "@/services/integration-hub/actions";
import type {
  IntegrationWithAccount,
  IntegrationLogEntry,
  UsageStats,
  ApiKeyInfo,
  WebhookInfo,
} from "@/services/integration-hub/types";
import type { IntegrationCategory } from "@/types/generated/database";

// ── Helpers ──────────────────────────────────────────────────────

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function getCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    ai: "AI",
    communication: "Communication",
    storage: "Storage",
    calendar: "Calendar",
    payment: "Payments",
    development: "Development",
    commerce: "Commerce",
    other: "Other",
  };
  return map[cat] ?? cat;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "inactive":
      return "secondary";
    case "maintenance":
      return "outline";
    case "deprecated":
      return "destructive";
    default:
      return "secondary";
  }
}

function getLogStatusIcon(status: string) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "timeout":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

// ── Popular Integrations (static catalog) ────────────────────────

const POPULAR_INTEGRATIONS = [
  { name: "Slack", slug: "slack", provider: "slack" as const, category: "communication" as IntegrationCategory, description: "Team messaging and notifications" },
  { name: "Gmail", slug: "gmail", provider: "google" as const, category: "communication" as IntegrationCategory, description: "Email communication" },
  { name: "Stripe", slug: "stripe", provider: "stripe" as const, category: "payment" as IntegrationCategory, description: "Payment processing" },
  { name: "GitHub", slug: "github", provider: "github" as const, category: "development" as IntegrationCategory, description: "Code repository & CI/CD" },
  { name: "OpenAI", slug: "openai", provider: "openai" as const, category: "ai" as IntegrationCategory, description: "AI text generation" },
  { name: "Google Drive", slug: "google-drive", provider: "google" as const, category: "storage" as IntegrationCategory, description: "Cloud file storage" },
  { name: "Shopify", slug: "shopify", provider: "shopify" as const, category: "commerce" as IntegrationCategory, description: "E-commerce platform" },
  { name: "Anthropic", slug: "anthropic", provider: "anthropic" as const, category: "ai" as IntegrationCategory, description: "AI assistant models" },
];

// ── Props ────────────────────────────────────────────────────────

interface IntegrationHubDashboardProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────

export function IntegrationHubDashboard({
  workspaceId,
}: IntegrationHubDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [connectedAccounts, setConnectedAccounts] = useState<IntegrationWithAccount[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookInfo[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<IntegrationLogEntry[]>([]);
  const [connectedSlugs, setConnectedSlugs] = useState<Set<string>>(new Set());

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    Promise.all([
      listConnectedAccounts(workspaceId).then((res) => {
        if (res.success && res.data) {
          setConnectedAccounts(res.data);
          setConnectedSlugs(
            new Set(res.data.filter((a) => a.account).map((a) => a.slug))
          );
        } else {
          setError(res.message ?? "Failed to load connected accounts");
        }
      }),
      listApiKeys(workspaceId).then((res) => {
        if (res.success && res.data) setApiKeys(res.data);
      }),
      listWebhooks(workspaceId).then((res) => {
        if (res.success && res.data) setWebhooks(res.data);
      }),
      getUsageAnalytics({
        workspaceId,
        startDate: startOfMonth,
        endDate: endOfMonth,
      }).then((res) => {
        if (res.success && res.data) setUsageStats(res.data);
      }),
      getIntegrationLogs({
        workspaceId,
        limit: 10,
        offset: 0,
      }).then((res) => {
        if (res.success && res.data) setRecentLogs(res.data);
      }),
    ]).finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // ── Quick Connect Handler ─────────────────────────────────────

  const handleQuickConnect = async (slug: string, _provider: string) => {
    try {
      const res = await connectIntegration({
        workspaceId,
        integrationId: slug,
        config: {},
        displayName: slug,
      });
      if (res.success) {
        toast.success(`${slug} integration connected successfully`);
        fetchData();
      } else {
        toast.error(res.message ?? "Failed to connect integration");
      }
    } catch {
      toast.error("An unexpected error occurred");
    }
  };

  // ── Compute stats ─────────────────────────────────────────────

  const connectedCount = connectedAccounts.filter((a) => a.account).length;
  const activeWebhookCount = webhooks.filter((w) => w.status === "active").length;
  const activeKeyCount = apiKeys.filter((k) => k.status === "active").length;
  const eventsThisMonth = usageStats?.totalCalls ?? 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Integration Hub</h2>
          <p className="text-muted-foreground text-sm">
            Manage your integrations, API keys, and webhooks
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <ExternalLink className="mr-2 h-4 w-4" />
            Browse Marketplace
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Connect Integration
          </Button>
        </div>
      </div>

      {/* ── Error Alert ─────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Stats Row: 4 cards ──────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connected Services</CardTitle>
            <Plug className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{connectedCount}</div>
                <p className="text-muted-foreground text-xs">
                  of {connectedAccounts.length} available
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Webhooks</CardTitle>
            <Webhook className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{activeWebhookCount}</div>
                <p className="text-muted-foreground text-xs">
                  of {webhooks.length} total
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Keys</CardTitle>
            <Key className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{activeKeyCount}</div>
                <p className="text-muted-foreground text-xs">
                  of {apiKeys.length} total
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Events This Month</CardTitle>
            <Activity className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{eventsThisMonth.toLocaleString()}</div>
                <p className="text-muted-foreground text-xs">
                  {usageStats?.successCalls ?? 0} succeeded
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Two Column: Recently Connected + Activity ───────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recently Connected */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Recently Connected
            </CardTitle>
            <CardDescription>Last 5 connected accounts</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : connectedAccounts.filter((a) => a.account).length > 0 ? (
              <ScrollArea className="max-h-96">
                <div className="space-y-2">
                  {connectedAccounts
                    .filter((a) => a.account)
                    .sort(
                      (a, b) =>
                        new Date(b.account!.created_at).getTime() -
                        new Date(a.account!.created_at).getTime()
                    )
                    .slice(0, 5)
                    .map((item) => (
                      <div
                        key={item.account!.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Plug className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {item.account!.display_name ?? item.name}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {item.provider ?? item.category}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge variant={getStatusVariant(item.account!.status)} className="text-xs">
                            {item.account!.status}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {formatRelativeDate(item.account!.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Plug className="text-muted-foreground mb-2 h-8 w-8" />
                <p className="text-muted-foreground text-sm">No connected integrations yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Last 10 integration events</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentLogs.length > 0 ? (
              <ScrollArea className="max-h-96">
                <div className="space-y-1">
                  {recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="mt-0.5 shrink-0">
                        {getLogStatusIcon(log.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {log.action}
                          </p>
                          <Badge variant="outline" className="shrink-0 text-[10px] px-1.5">
                            {log.direction}
                          </Badge>
                        </div>
                        {log.error_message && (
                          <p className="text-red-500 mt-0.5 truncate text-xs">
                            {log.error_message}
                          </p>
                        )}
                      </div>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatRelativeDate(log.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="text-muted-foreground mb-2 h-8 w-8" />
                <p className="text-muted-foreground text-sm">No activity yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom: Quick Connect ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Quick Connect
          </CardTitle>
          <CardDescription>Popular integrations to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {POPULAR_INTEGRATIONS.map((integ) => {
              const isConnected = connectedSlugs.has(integ.slug);
              return (
                <div
                  key={integ.slug}
                  className="group relative rounded-lg border p-4 transition-all hover:shadow-md hover:border-foreground/20"
                >
                  {isConnected && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Plug className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{integ.name}</p>
                      <Badge variant="outline" className="mt-1 text-[10px] px-1.5">
                        {getCategoryLabel(integ.category)}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs line-clamp-2">
                    {integ.description}
                  </p>
                  <div className="mt-3">
                    {isConnected ? (
                      <Button variant="secondary" size="sm" className="w-full text-xs" disabled>
                        Connected
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => handleQuickConnect(integ.slug, integ.provider)}
                      >
                        <ArrowUpRight className="mr-1 h-3 w-3" />
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
