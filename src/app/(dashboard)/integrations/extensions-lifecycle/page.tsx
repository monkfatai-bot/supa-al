"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  getInstalledExtensions,
  checkForUpdates,
  updateExtension,
  rollbackExtension,
  enableExtension,
  disableExtension,
  pinVersion,
  unpinVersion,
  uninstallExtension,
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
import { toast } from "sonner";
import {
  Puzzle,
  CheckCircle2,
  Pin,
  PinOff,
  Download,
  RefreshCw,
  ArrowDownToLine,
  Trash2,
  Power,
  PowerOff,
  AlertTriangle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface InstalledExtension {
  id: string;
  workspace_id: string;
  item_id: string;
  current_version: string;
  pinned_version: string | null;
  previous_version: string | null;
  status: string;
  config: Record<string, unknown> | null;
  installed_at: string;
  updated_at: string;
  uninstalled_at: string | null;
  rollback_count: number;
}

interface UpdatableExtension {
  installedExtensionId: string;
  itemId: string;
  itemName: string;
  currentVersion: string;
  latestVersion: string;
  pinned: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "active":
      return { label: "Active", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
    case "inactive":
      return { label: "Inactive", cls: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" };
    case "error":
      return { label: "Error", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
    case "updating":
      return { label: "Updating", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
    default:
      return { label: status, cls: "" };
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

// ─── Component ──────────────────────────────────────────────────

export default function ExtensionsLifecyclePage() {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const [extensions, setExtensions] = useState<InstalledExtension[]>([]);
  const [updates, setUpdates] = useState<UpdatableExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Uninstall confirmation
  const [uninstallTarget, setUninstallTarget] = useState<InstalledExtension | null>(null);

  const fetchExtensions = useCallback(async () => {
    if (!workspace?.id) return;
    setIsLoading(true);
    try {
      const result: ServiceResult<InstalledExtension[]> =
        await getInstalledExtensions(workspace.id);
      if (result.success && result.data) {
        setExtensions(result.data);
      } else {
        toast.error(result.message || "Failed to fetch extensions");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchExtensions();
  }, [fetchExtensions]);

  const handleCheckUpdates = useCallback(async () => {
    if (!workspace?.id) return;
    setIsCheckingUpdates(true);
    try {
      const result: ServiceResult<UpdatableExtension[]> =
        await checkForUpdates(workspace.id);
      if (result.success && result.data) {
        setUpdates(result.data);
        if (result.data.length > 0) {
          toast.success(`Found ${result.data.length} update(s) available`);
        } else {
          toast.info("All extensions are up to date");
        }
      } else {
        toast.error(result.message || "Failed to check for updates");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [workspace?.id]);

  const handleToggle = useCallback(
    async (ext: InstalledExtension) => {
      setActionLoading(ext.id);
      try {
        const fn = ext.status === "active" ? disableExtension : enableExtension;
        const result = await fn(ext.id);
        if (result.success) {
          toast.success(result.message);
          await fetchExtensions();
        } else {
          toast.error(result.message || "Action failed");
        }
      } catch {
        toast.error("Something went wrong");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchExtensions]
  );

  const handleUpdate = useCallback(
    async (ext: InstalledExtension) => {
      if (!workspace?.id) return;
      setActionLoading(ext.id);
      try {
        const result = await updateExtension({
          workspaceId: workspace.id,
          installedExtensionId: ext.id,
        });
        if (result.success) {
          toast.success(result.message);
          await fetchExtensions();
          setUpdates((prev) => prev.filter((u) => u.installedExtensionId !== ext.id));
        } else {
          toast.error(result.message || "Update failed");
        }
      } catch {
        toast.error("Something went wrong");
      } finally {
        setActionLoading(null);
      }
    },
    [workspace?.id, fetchExtensions]
  );

  const handleRollback = useCallback(
    async (ext: InstalledExtension) => {
      setActionLoading(ext.id);
      try {
        const result = await rollbackExtension(ext.id);
        if (result.success) {
          toast.success(result.message);
          await fetchExtensions();
        } else {
          toast.error(result.message || "Rollback failed");
        }
      } catch {
        toast.error("Something went wrong");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchExtensions]
  );

  const handlePin = useCallback(
    async (ext: InstalledExtension) => {
      setActionLoading(ext.id);
      try {
        const result = ext.pinned_version
          ? await unpinVersion(ext.id)
          : await pinVersion(ext.id, ext.current_version);
        if (result.success) {
          toast.success(result.message);
          await fetchExtensions();
        } else {
          toast.error(result.message || "Pin action failed");
        }
      } catch {
        toast.error("Something went wrong");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchExtensions]
  );

  const handleUninstall = useCallback(
    async (ext: InstalledExtension) => {
      setActionLoading(ext.id);
      try {
        const result = await uninstallExtension(ext.id);
        if (result.success) {
          toast.success(result.message);
          await fetchExtensions();
        } else {
          toast.error(result.message || "Uninstall failed");
        }
      } catch {
        toast.error("Something went wrong");
      } finally {
        setActionLoading(null);
        setUninstallTarget(null);
      }
    },
    [fetchExtensions]
  );

  // Summary stats
  const { installed, active, updatableCount, pinned } = useMemo(() => {
    const i = extensions.length;
    const a = extensions.filter((e) => e.status === "active").length;
    const updateIds = new Set(updates.map((u) => u.installedExtensionId));
    const u = extensions.filter((e) => updateIds.has(e.id)).length;
    const p = extensions.filter((e) => !!e.pinned_version).length;
    return { installed: i, active: a, updatableCount: u, pinned: p };
  }, [extensions, updates]);

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
            Extension Lifecycle
          </h1>
          <p className="text-muted-foreground">
            Manage installed extensions, versions, and updates.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleCheckUpdates}
          disabled={isCheckingUpdates}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isCheckingUpdates ? "animate-spin" : ""}`}
          />
          {isCheckingUpdates ? "Checking…" : "Check for Updates"}
        </Button>
      </div>

      {/* Updates Available Banner */}
      {updates.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-amber-600" />
                <span className="font-medium">
                  {updates.length} update(s) available
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {updates.slice(0, 3).map((u) => (
                  <Badge
                    key={u.installedExtensionId}
                    variant="outline"
                    className="text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800"
                  >
                    {u.itemName} → v{u.latestVersion}
                  </Badge>
                ))}
                {updates.length > 3 && (
                  <Badge variant="outline">+{updates.length - 3} more</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Puzzle className="h-3.5 w-3.5" />
              Installed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{installed}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Active
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{active}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-amber-500">
              <Download className="h-3.5 w-3.5" />
              Updates Available
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {updatableCount}
            </div>
          </CardContent>
        </Card>
        <Card className="border-violet-200 dark:border-violet-900/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-violet-600">
              <Pin className="h-3.5 w-3.5" />
              Pinned
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-600">{pinned}</div>
          </CardContent>
        </Card>
      </div>

      {/* Extensions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Puzzle className="h-4 w-4" />
            Installed Extensions
          </CardTitle>
          <CardDescription>
            Manage version, pinning, and lifecycle for each extension.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : extensions.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <Puzzle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                No extensions installed
              </h3>
              <p className="text-muted-foreground text-sm text-center max-w-sm">
                Extensions from the marketplace will appear here after
                installation.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Extension</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Pinned
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Installed
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Updated
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extensions.map((ext) => {
                    const st = statusBadge(ext.status);
                    const hasUpdate = updates.some(
                      (u) => u.installedExtensionId === ext.id
                    );
                    const isActing = actionLoading === ext.id;
                    return (
                      <TableRow key={ext.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <Puzzle className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <span className="font-medium">
                              {ext.item_id.slice(0, 12)}…
                            </span>
                            {hasUpdate && (
                              <Badge
                                variant="outline"
                                className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-800 text-xs"
                              >
                                Update
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          v{ext.current_version}
                          {ext.pinned_version && (
                            <span className="ml-1 text-xs text-violet-500">
                              (pinned)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={st.cls}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {ext.pinned_version ? (
                            <Pin className="h-4 w-4 text-violet-500" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(ext.installed_at)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(ext.updated_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isActing}
                              onClick={() => handleToggle(ext)}
                              title={ext.status === "active" ? "Disable" : "Enable"}
                            >
                              {ext.status === "active" ? (
                                <PowerOff className="h-3.5 w-3.5" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            {hasUpdate && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isActing || !!ext.pinned_version}
                                onClick={() => handleUpdate(ext)}
                                title="Update"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {ext.previous_version && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isActing}
                                onClick={() => handleRollback(ext)}
                                title="Rollback"
                              >
                                <ArrowDownToLine className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isActing}
                              onClick={() => handlePin(ext)}
                              title={ext.pinned_version ? "Unpin" : "Pin"}
                            >
                              {ext.pinned_version ? (
                                <PinOff className="h-3.5 w-3.5" />
                              ) : (
                                <Pin className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isActing}
                              onClick={() => setUninstallTarget(ext)}
                              title="Uninstall"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

      {/* Uninstall Confirmation */}
      <AlertDialog
        open={!!uninstallTarget}
        onOpenChange={(open) => !open && setUninstallTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Uninstall Extension
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to uninstall this extension? It can be
              reinstalled later from the marketplace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => uninstallTarget && handleUninstall(uninstallTarget)}
            >
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
