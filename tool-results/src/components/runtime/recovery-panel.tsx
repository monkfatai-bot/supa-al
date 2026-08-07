"use client";

/**
 * Supa AI — Phase 12 Runtime — recovery panel.
 *
 * Lists recovery records (checkpoints + restores + restarts + failovers)
 * for the workspace, with a "Create checkpoint" action and a
 * "Recover session" action that trigger the runtime recovery flow.
 *
 * Each row shows the recovery_type, status, session_id, started_at,
 * completed_at, and error (if any).
 *
 * @module @/components/runtime/recovery-panel
 */
import * as React from "react";
import {
  History,
  LifeBuoy,
  Save,
  AlertTriangle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { RuntimeRecovery } from "@/lib/runtime/types";
import { useCreateRecovery, useRuntimeRecovery } from "@/hooks/use-runtime";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
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
import {
  RECOVERY_STATUS_STYLES,
  formatTime,
  humanize,
} from "./status-styles";

export interface RecoveryPanelProps {
  workspaceId: string;
  className?: string;
}

export function RecoveryPanel({ workspaceId, className }: RecoveryPanelProps) {
  const { toast } = useToast();
  const query = useRuntimeRecovery(workspaceId);
  const createMutation = useCreateRecovery();

  const [recoveryType, setRecoveryType] = React.useState<
    "checkpoint" | "restore" | "restart" | "failover"
  >("checkpoint");

  const handleCreate = React.useCallback(() => {
    createMutation.mutate(
      {
        workspaceId,
        recoveryType,
      },
      {
        onSuccess: () => {
          toast({
            title:
              recoveryType === "checkpoint"
                ? "Checkpoint created"
                : `${humanize(recoveryType)} initiated`,
            description:
              recoveryType === "checkpoint"
                ? "Runtime state has been snapshotted."
                : "Recovery is running. Check the table below for status.",
          });
        },
        onError: (err: Error) => {
          toast({
            title: "Recovery failed",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  }, [createMutation, recoveryType, workspaceId, toast]);

  return (
    <div className={cn("space-y-4", className)}>
      <SectionCard
        title="Runtime recovery"
        description="Create a checkpoint of the current runtime state, or trigger a restore / restart / failover for the workspace."
        icon={LifeBuoy}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={recoveryType}
              onValueChange={(v) =>
                setRecoveryType(v as typeof recoveryType)
              }
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checkpoint">Checkpoint</SelectItem>
                <SelectItem value="restore">Restore</SelectItem>
                <SelectItem value="restart">Restart</SelectItem>
                <SelectItem value="failover">Failover</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={createMutation.isPending}
              onClick={handleCreate}
            >
              {recoveryType === "checkpoint" ? (
                <Save className="size-3.5" aria-hidden="true" />
              ) : (
                <LifeBuoy className="size-3.5" aria-hidden="true" />
              )}
              {recoveryType === "checkpoint"
                ? "Create checkpoint"
                : `${humanize(recoveryType)} session`}
            </Button>
          </div>
        }
        contentClassName="p-0"
      >
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <EmptyState
              icon={History}
              title="Couldn't load recovery records"
              description="Please try again later."
            />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={History}
              title="No recovery records yet"
              description="Create a checkpoint to snapshot the current runtime state, or trigger a restore / restart / failover from this panel."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((r) => (
                  <RecoveryRow key={r.id} recovery={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function RecoveryRow({ recovery }: { recovery: RuntimeRecovery }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {humanize(recovery.recovery_type)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase tracking-wide",
            RECOVERY_STATUS_STYLES[recovery.status] ??
              "border-transparent bg-muted text-muted-foreground",
          )}
        >
          {humanize(recovery.status)}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {recovery.session_id ? recovery.session_id.slice(0, 8) : "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {formatTime(recovery.started_at)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {formatTime(recovery.completed_at)}
      </TableCell>
      <TableCell>
        {recovery.error ? (
          <span className="inline-flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[280px]">{recovery.error}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
