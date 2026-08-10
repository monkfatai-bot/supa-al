"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  getOAuthLifecycleStatus,
  autoRefreshExpiredTokens,
  getTokenAuditHistory,
  scheduleReAuthentication,
  refreshIntegrationToken,
} from "@/services/integration-hub";
import type { ServiceResult } from "@/services/integration-hub";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  KeyRound,
  RefreshCw,
  ChevronDown,
  ChevronUp,
 CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface LifecycleStatus {
  accountId: string;
  provider: string;
  status: string;
  expiresAt: string | null;
  isExpiringSoon: boolean;
  lastRefreshAt: string | null;
  refreshCount: number;
  needsAttention: boolean;
}

interface AuditEntry {
  id: string;
  oauth_token_id: string;
  integration_account_id: string;
  workspace_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function deriveTokenStatus(item: LifecycleStatus): string {
  if (item.status === "revoked") return "Revoked";
  if (item.status === "needs_reauth") return "Needs Reauth";
  if (item.status === "error") return "Expired";
  const now = Date.now();
  if (item.expiresAt && new Date(item.expiresAt).getTime() < now) return "Expired";
  if (item.isExpiringSoon) return "Expiring Soon";
  return "Valid";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "Valid":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "Expiring Soon":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "Expired":
    case "Revoked":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "Needs Reauth":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default:
      return "";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "Valid":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
    case "Expiring Soon":
      return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    case "Expired":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "Revoked":
      return <ShieldAlert className="h-3.5 w-3.5 text-red-500" />;
    case "Needs Reauth":
      return <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />;
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function providerLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

// ─── Component ──────────────────────────────────────────────────

export default function OAuthLifecyclePage() {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const [items, setItems] = useState<LifecycleStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [auditMap, setAuditMap] = useState<Record<string, AuditEntry[]>>({});
  const [loadingAudit, setLoadingAudit] = useState<string | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const fetchLifecycle = useCallback(async () => {
    if (!workspace?.id) return;
    setIsLoading(true);
    try {
      const result: ServiceResult<LifecycleStatus[]> =
        await getOAuthLifecycleStatus(workspace.id);
      if (result.success && result.data) {
        setItems(result.data);
      } else {
        toast.error(result.message || "Failed to fetch lifecycle status");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchLifecycle();
  }, [fetchLifecycle]);

  const fetchAudit = useCallback(
    async (accountId: string) => {
      if (!workspace?.id) return;
      if (auditMap[accountId]) {
        setExpandedId((prev) => (prev === accountId ? null : accountId));
        return;
      }
      setLoadingAudit(accountId);
      try {
        const result = await getTokenAuditHistory(workspace.id, accountId, 10);
        if (result.success && result.data) {
          setAuditMap((prev) => ({
            ...prev,
            [accountId]: result.data!.entries,
          }));
          setExpandedId(accountId);
        } else {
          toast.error(result.message || "Failed to fetch audit history");
        }
      } catch {
        toast.error("Failed to load audit history");
      } finally {
        setLoadingAudit(null);
      }
    },
    [workspace?.id, auditMap]
  );

  const handleAutoRefresh = useCallback(async () => {
    setIsAutoRefreshing(true);
    try {
      const result = await autoRefreshExpiredTokens();
      if (result.success) {
        toast.success(result.message || "Auto-refresh completed");
        await fetchLifecycle();
      } else {
        toast.error(result.message || "Auto-refresh failed");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsAutoRefreshing(false);
    }
  }, [fetchLifecycle]);

  const handleRefreshToken = useCallback(
    async (accountId: string) => {
      setRefreshingId(accountId);
      try {
        const result = await refreshIntegrationToken(workspace!.id, accountId);
        if (result.success) {
          toast.success("Token refreshed");
          await fetchLifecycle();
        } else {
          toast.error(result.message || "Failed to refresh token");
        }
      } catch {
        toast.error("Failed to refresh token");
      } finally {
        setRefreshingId(null);
      }
    },
    [fetchLifecycle]
  );

  const handleReAuth = useCallback(
    async (accountId: string) => {
      if (!workspace?.id) return;
      try {
        const result = await scheduleReAuthentication(workspace.id, accountId);
        if (result.success) {
          toast.success(result.message || "Re-authentication scheduled");
          await fetchLifecycle();
        } else {
          toast.error(result.message || "Failed to schedule re-authentication");
        }
      } catch {
        toast.error("Something went wrong");
      }
    },
    [workspace?.id, fetchLifecycle]
  );

  // Summary stats
  const { total, healthy, expiringSoon, needsAttention } = useMemo(() => {
    const t = items.length;
    const h = items.filter((i) => deriveTokenStatus(i) === "Valid").length;
    const e = items.filter(
      (i) => deriveTokenStatus(i) === "Expiring Soon"
    ).length;
    const n = items.filter((i) => i.needsAttention).length;
    return { total: t, healthy: h, expiringSoon: e, needsAttention: n };
  }, [items]);

  if (wsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
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
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            OAuth Token Lifecycle
          </h1>
          <p className="text-muted-foreground">
            Monitor and manage OAuth tokens across all connected integrations.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleAutoRefresh}
          disabled={isAutoRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isAutoRefreshing ? "animate-spin" : ""}`}
          />
          {isAutoRefreshing ? "Refreshing Tokens…" : "Auto-Refresh Expired"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Total Connected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Healthy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{healthy}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-amber-500">
              <Clock className="h-3.5 w-3.5" />
              Expiring Soon
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {expiringSoon}
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              Needs Attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {needsAttention}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lifecycle Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            OAuth Connections
          </CardTitle>
          <CardDescription>
            Click a row to expand the audit history for that connection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <KeyRound className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                No OAuth connections
              </h3>
              <p className="text-muted-foreground text-sm text-center max-w-sm">
                OAuth-connected integrations will appear here once you connect
                them through the OAuth flow.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Provider</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Token Status</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Expires At
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Last Refresh
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Refreshes
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const tokenStatus = deriveTokenStatus(item);
                    const isExpanded = expandedId === item.accountId;
                    const audits = auditMap[item.accountId] ?? [];
                    return (
                      <>
                        <TableRow
                          key={item.accountId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => fetchAudit(item.accountId)}
                        >
                          <TableCell className="w-8">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {providerLabel(item.provider)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.accountId.slice(0, 8)}…
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={statusBadgeClass(tokenStatus)}
                            >
                              <span className="flex items-center gap-1">
                                {statusIcon(tokenStatus)}
                                {tokenStatus}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            {formatDateTime(item.expiresAt)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {formatDateTime(item.lastRefreshAt)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {item.refreshCount}
                          </TableCell>
                          <TableCell className="text-right">
                            <div
                              className="flex items-center justify-end gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  refreshingId === item.accountId ||
                                  tokenStatus === "Revoked"
                                }
                                onClick={() =>
                                  handleRefreshToken(item.accountId)
                                }
                              >
                                {refreshingId === item.accountId ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                <span className="ml-1 hidden sm:inline">
                                  Refresh
                                </span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReAuth(item.accountId)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span className="ml-1 hidden sm:inline">
                                  Re-auth
                                </span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded audit history */}
                        {isExpanded && (
                          <TableRow key={`${item.accountId}-audit`}>
                            <TableCell
                              colSpan={8}
                              className="bg-muted/30 px-8 py-4"
                            >
                              <div className="space-y-3">
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Audit History — {providerLabel(item.provider)}
                                </h4>
                                {loadingAudit === item.accountId ? (
                                  <div className="space-y-2">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                      <Skeleton
                                        key={i}
                                        className="h-10 w-full"
                                      />
                                    ))}
                                  </div>
                                ) : audits.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No audit entries found.
                                  </p>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto space-y-2">
                                    {audits.map((entry) => (
                                      <div
                                        key={entry.id}
                                        className="rounded-lg border p-3 text-sm"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium">
                                            {entry.action.replace(/_/g, " ")}
                                          </span>
                                          <span className="text-muted-foreground text-xs">
                                            {formatDateTime(entry.created_at)}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
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
