"use client";

/**
 * Supa AI — Phase 10 Integration Hub — installed apps list.
 *
 * Lists every app installed in the active workspace + the available
 * updates. Each row shows the app name, installed version, status, and
 * an Uninstall button.
 *
 * @module @/components/integrations/installed-apps
 */
import * as React from "react";
import { Plug, Trash2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  useInstalledApps,
  useInstallUpdates,
  useUninstallApp,
} from "@/hooks/use-integrations";
import { useToast } from "@/hooks/use-toast";

interface InstalledAppsProps {
  workspaceId: string;
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  installed: "default",
  uninstalled: "secondary",
  suspended: "destructive",
  update_available: "outline",
};

export function InstalledApps({ workspaceId }: InstalledAppsProps) {
  const { toast } = useToast();
  const installedQuery = useInstalledApps(workspaceId);
  const updatesQuery = useInstallUpdates(workspaceId);
  const uninstallMutation = useUninstallApp();

  const handleUninstall = React.useCallback(
    (installedAppId: string, name: string) => {
      uninstallMutation.mutate(
        { workspaceId, appId: installedAppId },
        {
          onSuccess: () => {
            toast({
              title: "Uninstalled",
              description: `${name} has been removed from this workspace.`,
            });
          },
          onError: (err: Error) => {
            toast({
              title: "Uninstall failed",
              description: err.message,
              variant: "destructive",
            });
          },
        },
      );
    },
    [uninstallMutation, workspaceId, toast],
  );

  if (installedQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (installedQuery.isError) {
    return (
      <EmptyState
        icon={Plug}
        title="Couldn't load installed apps"
        description="Please try again later."
      />
    );
  }

  const rows = (installedQuery.data ?? []).filter(
    (r) => r.status !== "uninstalled",
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Plug}
        title="No installed apps"
        description="Browse the marketplace to install your first app."
      />
    );
  }

  const updates = updatesQuery.data ?? [];

  return (
    <div className="space-y-3">
      {updates.length > 0 ? (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <RefreshCw className="size-4 text-blue-500" aria-hidden="true" />
            {updates.length} update{updates.length === 1 ? "" : "s"} available
          </div>
        </div>
      ) : null}

      <ul className="divide-y rounded-md border">
        {rows.map((row) => {
          const update = updates.find((u) => u.appId === row.app_id);
          return (
            <li
              key={row.id}
              className="flex items-center gap-3 p-3"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold">
                {(row.installed_app?.name ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.installed_app?.name ?? row.app_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  v{row.installed_version ?? "?"}
                  {update?.updateAvailable ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-blue-500">
                      <RefreshCw className="size-3" aria-hidden="true" />
                      v{update.latestVersion} available
                    </span>
                  ) : null}
                </p>
              </div>
              <Badge variant={STATUS_BADGE[row.status] ?? "secondary"}>
                {row.status}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleUninstall(row.id, row.installed_app?.name ?? "App")}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Uninstall
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
