"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  Settings,
  Trash2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  listInstalledExtensions,
  updateInstalledExtension,
  uninstallExtension,
} from "@/services/marketplace/actions";
import type {
  InstalledExtensionWithItem,
  MarketplaceActionResponse,
} from "@/services/marketplace/types";
import type { ExtensionStatus } from "@/types/generated/database";

// ── Helpers ──────────────────────────────────────────────────────

function getStatusBadge(status: ExtensionStatus) {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-[10px] px-1.5">
          <ShieldCheck className="mr-1 h-3 w-3" />
          Active
        </Badge>
      );
    case "inactive":
      return (
        <Badge variant="secondary" className="text-[10px] px-1.5">
          <ShieldOff className="mr-1 h-3 w-3" />
          Inactive
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-[10px] px-1.5">
          <ShieldAlert className="mr-1 h-3 w-3" />
          Error
        </Badge>
      );
    case "updating":
      return (
        <Badge variant="outline" className="text-[10px] px-1.5">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Updating
        </Badge>
      );
    default:
      return <Badge variant="secondary" className="text-[10px] px-1.5">{status}</Badge>;
  }
}

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

// ── Props ────────────────────────────────────────────────────────

interface ExtensionManagerProps {
  workspaceId: string;
  onSwitchToMarketplace?: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function ExtensionManager({
  workspaceId,
  onSwitchToMarketplace,
}: ExtensionManagerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<InstalledExtensionWithItem[]>([]);
  const [activeTab, setActiveTab] = useState("installed");

  // Configure dialog state
  const [configOpen, setConfigOpen] = useState(false);
  const [configExt, setConfigExt] = useState<InstalledExtensionWithItem | null>(null);
  const [configJson, setConfigJson] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Uninstall confirm dialog
  const [uninstallTarget, setUninstallTarget] = useState<InstalledExtensionWithItem | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  const fetchExtensions = useCallback(() => {
    setLoading(true);
    setError(null);

    listInstalledExtensions(workspaceId)
      .then((res: MarketplaceActionResponse) => {
        if (res.success && Array.isArray(res.data)) {
          setExtensions(res.data as InstalledExtensionWithItem[]);
        } else {
          setError(res.message ?? "Failed to load extensions");
        }
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    fetchExtensions();
  }, [fetchExtensions]);

  // ── Configure handler ──────────────────────────────────────────

  const openConfigure = (ext: InstalledExtensionWithItem) => {
    setConfigExt(ext);
    setConfigJson(JSON.stringify(ext.config ?? {}, null, 2));
    setConfigOpen(true);
  };

  const handleSaveConfig = async () => {
    if (!configExt) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(configJson);
    } catch {
      toast.error("Invalid JSON configuration");
      return;
    }
    setSavingConfig(true);
    try {
      const res = await updateInstalledExtension({
        workspaceId,
        itemId: configExt.item_id,
        config: parsed as import("@/types/generated/database").Json,
      });
      if (res.success) {
        toast.success("Configuration saved");
        setConfigOpen(false);
        fetchExtensions();
      } else {
        toast.error(res.message ?? "Failed to save configuration");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setSavingConfig(false);
    }
  };

  // ── Uninstall handler ──────────────────────────────────────────

  const handleUninstall = async () => {
    if (!uninstallTarget) return;
    setUninstalling(true);
    try {
      const res = await uninstallExtension(workspaceId, uninstallTarget.item_id);
      if (res.success) {
        toast.success(`${uninstallTarget.item?.name ?? "Extension"} uninstalled`);
        setUninstallTarget(null);
        fetchExtensions();
      } else {
        toast.error(res.message ?? "Failed to uninstall extension");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setUninstalling(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">
            Installed Extensions
          </h2>
          {!loading && (
            <Badge variant="secondary" className="text-xs">
              {extensions.length}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="available" onClick={onSwitchToMarketplace}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Available
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="mt-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <Skeleton className="h-3 w-full" />
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-8 w-20" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : extensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="text-muted-foreground mb-3 h-10 w-10" />
              <h3 className="text-lg font-medium">No extensions installed yet</h3>
              <p className="text-muted-foreground mt-1 text-sm max-w-md">
                Browse the Marketplace to discover and install extensions for
                your workspace.
              </p>
              {onSwitchToMarketplace && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={onSwitchToMarketplace}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Browse Marketplace
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {extensions.map((ext) => (
                <Card
                  key={ext.id}
                  className="transition-all hover:shadow-md hover:border-foreground/20"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {ext.item?.icon_url ? (
                          <img
                            src={ext.item.icon_url}
                            alt={ext.item.name}
                            className="h-5 w-5 rounded object-contain"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm leading-tight line-clamp-1">
                          {ext.item?.name ?? "Unknown Extension"}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          v{ext.version}
                        </CardDescription>
                      </div>
                      {getStatusBadge(ext.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <p className="text-muted-foreground text-xs line-clamp-2">
                      {ext.item?.description ?? "No description"}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Installed {formatRelativeDate(ext.installed_at)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => openConfigure(ext)}
                      >
                        <Settings className="mr-1.5 h-3 w-3" />
                        Configure
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                        onClick={() => setUninstallTarget(ext)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Configure Dialog ──────────────────────────────────── */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Configure {configExt?.item?.name ?? "Extension"}
            </DialogTitle>
            <DialogDescription>
              Edit the JSON configuration for this extension.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="config-editor">Configuration (JSON)</Label>
            <Textarea
              id="config-editor"
              className="mt-2 min-h-48 font-mono text-xs"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              placeholder='{}'
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)} disabled={savingConfig}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} disabled={savingConfig}>
              {savingConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Uninstall Confirm Dialog ──────────────────────────── */}
      <AlertDialog open={!!uninstallTarget} onOpenChange={(open) => !open && setUninstallTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall Extension</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to uninstall{" "}
              <span className="font-medium">
                {uninstallTarget?.item?.name ?? "this extension"}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uninstalling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={(e) => {
                e.preventDefault();
                handleUninstall();
              }}
              disabled={uninstalling}
            >
              {uninstalling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
