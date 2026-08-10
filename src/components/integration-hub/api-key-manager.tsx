"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Key,
  BarChart3,
  AlertTriangle,
  Loader2,
  Check,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  createApiKey,
  listApiKeys,
  getApiKeyUsage,
  revokeApiKey,
  rotateApiKey,
} from "@/services/integration-hub/actions";
import type { ApiKeyInfo, ApiKeyUsageStats } from "@/services/integration-hub/types";

// ── Helpers ──────────────────────────────────────────────────────

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

function getStatusBadge(status: string): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (status) {
    case "active":
      return { label: "Active", variant: "default" };
    case "inactive":
      return { label: "Inactive", variant: "secondary" };
    case "expired":
      return { label: "Expired", variant: "destructive" };
    case "revoked":
      return { label: "Revoked", variant: "outline" };
    default:
      return { label: status, variant: "secondary" };
  }
}

// ── Props ────────────────────────────────────────────────────────

interface ApiKeyManagerProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────

export function ApiKeyManager({ workspaceId }: ApiKeyManagerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);

  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPermissions, setNewKeyPermissions] = useState<{
    read: boolean;
    write: boolean;
    admin: boolean;
  }>({ read: true, write: false, admin: false });
  const [newKeyScope, setNewKeyScope] = useState("workspace");
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(100);
  const [newKeyExpiryDays, setNewKeyExpiryDays] = useState("");
  const [creating, setCreating] = useState(false);

  // One-time key reveal dialog
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revealKeyInfo, setRevealKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // Usage dialog
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [usageKeyName, setUsageKeyName] = useState("");
  const [usageData, setUsageData] = useState<ApiKeyUsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // Revoke/rotate confirmation
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null);
  const [rotateTarget, setRotateTarget] = useState<ApiKeyInfo | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch keys
  const fetchKeys = useCallback(() => {
    setLoading(true);
    setError(null);
    listApiKeys(workspaceId)
      .then((res) => {
        if (res.success && res.data) {
          setKeys(res.data);
        } else {
          setError(res.message ?? "Failed to load API keys");
        }
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // ── Create key handler ───────────────────────────────────────

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a key name");
      return;
    }

    setCreating(true);
    try {
      const permissions: Record<string, boolean> = {};
      if (newKeyPermissions.read) permissions.read = true;
      if (newKeyPermissions.write) permissions.write = true;
      if (newKeyPermissions.admin) permissions.admin = true;

      const res = await createApiKey({
        workspaceId,
        name: newKeyName.trim(),
        permissions,
        scope: newKeyScope,
        rateLimit: newKeyRateLimit,
        expiresInDays: newKeyExpiryDays ? parseInt(newKeyExpiryDays, 10) : undefined,
      });

      if (res.success && res.data) {
        toast.success("API key created successfully");
        setCreateDialogOpen(false);
        setRevealKey(res.data.key);
        setRevealKeyInfo(res.data.keyInfo);
        resetCreateForm();
        fetchKeys();
      } else {
        toast.error(res.message ?? "Failed to create API key");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewKeyName("");
    setNewKeyPermissions({ read: true, write: false, admin: false });
    setNewKeyScope("workspace");
    setNewKeyRateLimit(100);
    setNewKeyExpiryDays("");
  };

  // ── Copy handler ─────────────────────────────────────────────

  const handleCopyPrefix = async (prefix: string) => {
    try {
      await navigator.clipboard.writeText(prefix);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCopyFullKey = async () => {
    if (!revealKey) return;
    try {
      await navigator.clipboard.writeText(revealKey);
      setCopied(true);
      toast.success("Key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  // ── Usage handler ────────────────────────────────────────────

  const handleViewUsage = async (key: ApiKeyInfo) => {
    setUsageKeyName(key.name);
    setUsageDialogOpen(true);
    setUsageLoading(true);
    setUsageData(null);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      const res = await getApiKeyUsage(
        workspaceId,
        key.id,
        thirtyDaysAgo.toISOString(),
        now.toISOString()
      );
      if (res.success && res.data) {
        setUsageData(res.data);
      } else {
        toast.error(res.message ?? "Failed to load usage data");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setUsageLoading(false);
    }
  };

  // ── Revoke handler ────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setActionLoading(true);
    try {
      const res = await revokeApiKey(workspaceId, revokeTarget.id);
      if (res.success) {
        toast.success(`Key "${revokeTarget.name}" has been revoked`);
        setRevokeTarget(null);
        fetchKeys();
      } else {
        toast.error(res.message ?? "Failed to revoke key");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Rotate handler ───────────────────────────────────────────

  const handleRotate = async () => {
    if (!rotateTarget) return;
    setActionLoading(true);
    try {
      const res = await rotateApiKey(workspaceId, rotateTarget.id);
      if (res.success && res.data) {
        toast.success("API key rotated. Save the new key now.");
        setRevealKey(res.data.key);
        setRevealKeyInfo(res.data.keyInfo);
        setRotateTarget(null);
        fetchKeys();
      } else {
        toast.error(res.message ?? "Failed to rotate key");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Usage chart data ─────────────────────────────────────────

  const maxUsage = useMemo(() => {
    if (!usageData?.dailyUsage) return 1;
    return Math.max(...usageData.dailyUsage.map((d) => d.count), 1);
  }, [usageData]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
          <p className="text-muted-foreground text-sm">
            Manage API keys for programmatic access
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create New Key
        </Button>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Keys Table ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Key className="text-muted-foreground mb-2 h-10 w-10" />
              <h3 className="text-lg font-medium">No API keys</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Create your first API key to get started
              </p>
              <Button className="mt-4" size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create New Key
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="hidden md:table-cell">Rate Limit</TableHead>
                    <TableHead className="hidden sm:table-cell">Usage</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Used</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => {
                    const statusBadge = getStatusBadge(key.status);
                    return (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium text-sm">
                          {key.name}
                        </TableCell>
                        <TableCell>
                          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                            {key.keyPrefix}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {key.scope}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs">
                          {key.rateLimit}/min
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">
                          {key.usageCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                          {formatRelativeDate(key.lastUsedAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadge.variant} className="text-xs">
                            {statusBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleCopyPrefix(key.keyPrefix)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy prefix</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleViewUsage(key)}
                                >
                                  <BarChart3 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View usage</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  disabled={key.status !== "active"}
                                  onClick={() => setRotateTarget(key)}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Rotate key</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                                  disabled={key.status !== "active"}
                                  onClick={() => setRevokeTarget(key)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Revoke key</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Key Dialog ──────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for programmatic access to your workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g., Production API Key"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="perm-read"
                    checked={newKeyPermissions.read}
                    onCheckedChange={(checked) =>
                      setNewKeyPermissions((p) => ({ ...p, read: !!checked }))
                    }
                  />
                  <Label htmlFor="perm-read" className="text-sm font-normal">
                    Read — Access data and resources
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="perm-write"
                    checked={newKeyPermissions.write}
                    onCheckedChange={(checked) =>
                      setNewKeyPermissions((p) => ({ ...p, write: !!checked }))
                    }
                  />
                  <Label htmlFor="perm-write" className="text-sm font-normal">
                    Write — Create and modify resources
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="perm-admin"
                    checked={newKeyPermissions.admin}
                    onCheckedChange={(checked) =>
                      setNewKeyPermissions((p) => ({ ...p, admin: !!checked }))
                    }
                  />
                  <Label htmlFor="perm-admin" className="text-sm font-normal">
                    Admin — Full administrative access
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-scope">Scope</Label>
              <Select value={newKeyScope} onValueChange={setNewKeyScope}>
                <SelectTrigger id="key-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">Workspace</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-rate-limit">Rate Limit (per minute)</Label>
              <Input
                id="key-rate-limit"
                type="number"
                min={1}
                value={newKeyRateLimit}
                onChange={(e) => setNewKeyRateLimit(parseInt(e.target.value, 10) || 100)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-expiry">Expiry (days, optional)</Label>
              <Input
                id="key-expiry"
                type="number"
                min={1}
                placeholder="Leave empty for no expiry"
                value={newKeyExpiryDays}
                onChange={(e) => setNewKeyExpiryDays(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ONE-TIME Reveal Key Dialog ─────────────────────────── */}
      <Dialog
        open={!!revealKey}
        onOpenChange={(open) => {
          if (!open) {
            setRevealKey(null);
            setRevealKeyInfo(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Save Your API Key
            </DialogTitle>
            <DialogDescription>
              Copy this key now. You will not be able to see it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This is the only time your API key will be displayed. Make sure to copy it to
                a secure location before closing this dialog.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Key Name: {revealKeyInfo?.name}</Label>
            </div>

            <div className="relative">
              <div className="bg-muted rounded-lg p-4 pr-12">
                <code className="text-xs break-all block select-all">
                  {revealKey}
                </code>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={handleCopyFullKey}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setRevealKey(null);
                setRevealKeyInfo(null);
                setCopied(false);
              }}
            >
              I have saved my key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Usage Dialog ───────────────────────────────────────── */}
      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Usage: {usageKeyName}
            </DialogTitle>
            <DialogDescription>
              API call usage over the last 30 days
            </DialogDescription>
          </DialogHeader>

          {usageLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : usageData ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Total calls (30d)</span>
                <span className="font-semibold text-sm">
                  {usageData.totalUsage.toLocaleString()}
                </span>
              </div>
              <Separator />

              {/* CSS bar chart */}
              <div className="space-y-1.5">
                {usageData.dailyUsage.length > 0 ? (
                  usageData.dailyUsage.map((day) => {
                    const pct = (day.count / maxUsage) * 100;
                    const dateLabel = new Date(day.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                    return (
                      <div key={day.date} className="flex items-center gap-2">
                        <span className="text-muted-foreground w-14 shrink-0 text-[10px] text-right">
                          {dateLabel}
                        </span>
                        <div className="bg-muted h-4 flex-1 overflow-hidden rounded-sm">
                          <div
                            className="bg-primary h-full rounded-sm transition-all"
                            style={{ width: `${Math.max(pct, day.count > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-[10px] text-right">
                          {day.count}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground text-sm py-4 text-center">
                    No usage data available for this period
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Unable to load usage data.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUsageDialogOpen(false)}>
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
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the key{" "}
              <strong>"{revokeTarget?.name}"</strong>? This action cannot be undone.
              All applications using this key will immediately lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Rotate Confirmation ─────────────────────────────────── */}
      <AlertDialog
        open={!!rotateTarget}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to rotate the key{" "}
              <strong>"{rotateTarget?.name}"</strong>? The current key will be
              immediately invalidated and a new key will be generated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotate} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rotate Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
