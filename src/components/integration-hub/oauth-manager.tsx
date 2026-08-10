"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw,
  ShieldOff,
  Eye,
  ChevronDown,
  Plug,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Filter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  listConnectedAccounts,
} from "@/services/integration-hub/actions";
import {
  getOAuthStatus,
  refreshOAuthToken,
  revokeOAuthToken,
  initiateOAuthFlow,
} from "@/services/integration-hub/actions";
import type {
  OAuthTokenStatus,
} from "@/services/integration-hub/types";
import type { OAuthProvider } from "@/types/generated/database";

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getTokenStatusLabel(status: OAuthTokenStatus): {
  label: string;
  className: string;
} {
  if (!status.valid) {
    return { label: "Revoked", className: "bg-gray-100 text-gray-600" };
  }
  if (status.isExpired) {
    return { label: "Expired", className: "bg-red-100 text-red-700" };
  }
  if (status.expiresAt) {
    const expires = new Date(status.expiresAt);
    const now = new Date();
    const hoursUntilExpiry = (expires.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilExpiry < 24) {
      return { label: "Expiring Soon", className: "bg-amber-100 text-amber-700" };
    }
  }
  return { label: "Active", className: "bg-emerald-100 text-emerald-700" };
}

const OAUTH_PROVIDERS: { value: OAuthProvider; label: string }[] = [
  { value: "google", label: "Google" },
  { value: "microsoft", label: "Microsoft" },
  { value: "github", label: "GitHub" },
  { value: "gitlab", label: "GitLab" },
  { value: "bitbucket", label: "Bitbucket" },
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
  { value: "stripe", label: "Stripe" },
  { value: "shopify", label: "Shopify" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "dropbox", label: "Dropbox" },
];

// ── Types ───────────────────────────────────────────────────────

interface OAuthAccount {
  id: string;
  integrationId: string;
  name: string;
  displayName: string | null;
  provider: OAuthProvider;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface OAuthManagerProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────

export function OAuthManager({ workspaceId }: OAuthManagerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const [accounts, setAccounts] = useState<OAuthAccount[]>([]);
  const [tokenStatuses, setTokenStatuses] = useState<
    Record<string, OAuthTokenStatus>
  >({});
  const [statusLoading, setStatusLoading] = useState<Set<string>>(
    new Set()
  );

  // Detail dialog
  const [detailAccount, setDetailAccount] = useState<OAuthAccount | null>(
    null
  );
  const [detailTokenStatus, setDetailTokenStatus] =
    useState<OAuthTokenStatus | null>(null);

  // Revoke confirmation
  const [revokeTarget, setRevokeTarget] = useState<OAuthAccount | null>(
    null
  );
  const [revoking, setRevoking] = useState(false);

  // Refreshing state
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());

  // Fetch accounts
  const fetchAccounts = useCallback(() => {
    setLoading(true);
    setError(null);

    listConnectedAccounts(workspaceId)
      .then((res) => {
        if (res.success && res.data) {
          const oauthAccounts = res.data
            .filter((a) => a.auth_type === "oauth" && a.account && a.provider)
            .map((a) => ({
              id: a.account!.id,
              integrationId: a.id,
              name: a.name,
              displayName: a.account!.display_name,
              provider: a.provider as OAuthProvider,
              status: a.account!.status,
              lastUsedAt: a.account!.last_used_at,
              createdAt: a.account!.created_at,
            }));
          setAccounts(oauthAccounts);

          // Fetch token status for each
          oauthAccounts.forEach((acc) => {
            getOAuthStatus(workspaceId, acc.id).then((statusRes) => {
              if (statusRes.success && statusRes.data) {
                setTokenStatuses((prev) => ({
                  ...prev,
                  [acc.id]: statusRes.data!,
                }));
              }
            });
          });
        } else {
          setError(res.message ?? "Failed to load OAuth accounts");
        }
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    if (providerFilter === "all") return accounts;
    return accounts.filter((a) => a.provider === providerFilter);
  }, [accounts, providerFilter]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleRefreshToken = async (accountId: string) => {
    setRefreshing((prev) => new Set(prev).add(accountId));
    try {
      const res = await refreshOAuthToken(accountId);
      if (res.success) {
        toast.success("Token refreshed successfully");
        // Re-fetch status
        const statusRes = await getOAuthStatus(workspaceId, accountId);
        if (statusRes.success && statusRes.data) {
          setTokenStatuses((prev) => ({
            ...prev,
            [accountId]: statusRes.data!,
          }));
        }
      } else {
        toast.error(res.message ?? "Failed to refresh token");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setRefreshing((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await revokeOAuthToken(workspaceId, revokeTarget.id);
      if (res.success) {
        toast.success(`${revokeTarget.displayName ?? revokeTarget.name} has been revoked`);
        setRevokeTarget(null);
        fetchAccounts();
      } else {
        toast.error(res.message ?? "Failed to revoke token");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setRevoking(false);
    }
  };

  const handleViewDetails = async (account: OAuthAccount) => {
    setDetailAccount(account);
    setStatusLoading((prev) => new Set(prev).add(account.id));
    setDetailTokenStatus(null);
    try {
      const res = await getOAuthStatus(workspaceId, account.id);
      if (res.success && res.data) {
        setDetailTokenStatus(res.data);
      } else {
        toast.error(res.message ?? "Failed to load token status");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setStatusLoading((prev) => {
        const next = new Set(prev);
        next.delete(account.id);
        return next;
      });
    }
  };

  const handleConnectNew = async (provider: OAuthProvider) => {
    try {
      const res = await initiateOAuthFlow({
        workspaceId,
        integrationId: provider,
        provider,
      });
      if (res.success && res.data) {
        toast.success("Redirecting to authorize...");
        window.location.href = res.data.authorizationUrl;
      } else {
        toast.error(res.message ?? "Failed to initiate OAuth flow");
      }
    } catch {
      toast.error("An unexpected error occurred");
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">OAuth Connections</h2>
          <p className="text-muted-foreground text-sm">
            Manage your OAuth-connected services
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Provider filter */}
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {OAUTH_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Connect New dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plug className="mr-2 h-4 w-4" />
                Connect New
                <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {OAUTH_PROVIDERS.map((p) => (
                <DropdownMenuItem
                  key={p.value}
                  onClick={() => handleConnectNew(p.value)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Accounts List ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Connected OAuth Accounts</CardTitle>
          <CardDescription>
            {filteredAccounts.length} OAuth connection{filteredAccounts.length !== 1 ? "s" : ""}
            {providerFilter !== "all" && ` for ${providerFilter}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShieldOff className="text-muted-foreground mb-2 h-10 w-10" />
              <h3 className="text-lg font-medium">No OAuth connections</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {providerFilter !== "all"
                  ? `No ${providerFilter} connections found`
                  : "Connect a service using OAuth to get started"}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-2">
                {filteredAccounts.map((account) => {
                  const tokenStatus = tokenStatuses[account.id];
                  const statusInfo = tokenStatus
                    ? getTokenStatusLabel(tokenStatus)
                    : { label: account.status, className: "bg-gray-100 text-gray-600" };
                  const isRefreshing = refreshing.has(account.id);

                  return (
                    <div
                      key={account.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      {/* Left: Icon + Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Plug className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">
                              {account.displayName ?? account.name}
                            </p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.className}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-muted-foreground text-xs">
                              {account.provider}
                            </span>
                            {tokenStatus && (
                              <span className="text-muted-foreground text-xs">
                                Scope: {tokenStatus.scope.split(" ").slice(0, 3).join(", ")}
                                {tokenStatus.scope.split(" ").length > 3 ? "..." : ""}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-muted-foreground text-xs">
                              <Clock className="h-3 w-3" />
                              {formatRelativeDate(account.lastUsedAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={isRefreshing || statusInfo.label === "Revoked"}
                          onClick={() => handleRefreshToken(account.id)}
                        >
                          {isRefreshing ? (
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1.5 h-3 w-3" />
                          )}
                          Refresh
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleViewDetails(account)}
                        >
                          <Eye className="mr-1.5 h-3 w-3" />
                          Details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setRevokeTarget(account)}
                        >
                          <ShieldOff className="mr-1.5 h-3 w-3" />
                          Revoke
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ── View Details Dialog ─────────────────────────────────── */}
      <Dialog
        open={!!detailAccount}
        onOpenChange={(open) => {
          if (!open) {
            setDetailAccount(null);
            setDetailTokenStatus(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {detailAccount?.displayName ?? detailAccount?.name ?? "OAuth Details"}
            </DialogTitle>
            <DialogDescription>
              Connection details for {detailAccount?.provider}
            </DialogDescription>
          </DialogHeader>

          {statusLoading.has(detailAccount?.id ?? "") ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : detailTokenStatus ? (
            <div className="space-y-4 py-2">
              <DetailRow label="Status">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getTokenStatusLabel(detailTokenStatus).className}`}
                >
                  {getTokenStatusLabel(detailTokenStatus).label}
                </span>
              </DetailRow>
              <Separator />
              <DetailRow label="Provider">{detailAccount?.provider}</DetailRow>
              <Separator />
              <DetailRow label="Scopes">
                <div className="flex flex-wrap gap-1">
                  {detailTokenStatus.scope.split(" ").map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>
              </DetailRow>
              <Separator />
              <DetailRow label="Connected">{formatDate(detailAccount?.createdAt ?? null)}</DetailRow>
              <Separator />
              <DetailRow label="Expires">{formatDate(detailTokenStatus.expiresAt)}</DetailRow>
              <Separator />
              <DetailRow label="Refresh Expires">
                {formatDate(detailTokenStatus.refreshExpiresAt)}
              </DetailRow>
              <Separator />
              <DetailRow label="Last Used">
                {formatRelativeDate(detailAccount?.lastUsedAt ?? null)}
              </DetailRow>
              <Separator />
              <DetailRow label="Refreshable">
                {detailTokenStatus.isRefreshable ? (
                  <span className="flex items-center gap-1 text-emerald-600 text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Yes
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground text-sm">
                    <XCircle className="h-4 w-4" /> No
                  </span>
                )}
              </DetailRow>
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-sm">
              Unable to load token status.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDetailAccount(null);
                setDetailTokenStatus(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke Confirmation ─────────────────────────────────── */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke OAuth Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke access for{" "}
              <strong>{revokeTarget?.displayName ?? revokeTarget?.name}</strong>? This will
              disconnect the {revokeTarget?.provider} integration and invalidate all tokens.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-red-600 hover:bg-red-700"
            >
              {revoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-component ───────────────────────────────────────────────

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <div className="text-right text-sm">{children}</div>
    </div>
  );
}
