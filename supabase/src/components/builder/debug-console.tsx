"use client";

/**
 * Supa AI — Phase 9B Builder — debug console.
 *
 * Shows the latest debug session status, the trace log (one row per
 * visited node), and the start / pause / resume / stop controls.
 *
 * Reads `/api/builder/workflows/:id/debug` via {@link useDebugSession};
 * mutates via {@link useMutateDebugSession}.
 *
 * @module @/components/builder/debug-console
 */
import * as React from "react";
import { Pause, Play, Square, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DebugLogEntry } from "@/lib/builder/client";
import {
  useDebugSession,
  useMutateDebugSession,
} from "@/hooks/use-builder";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export interface DebugConsoleProps {
  workspaceId: string | null;
  workflowId: string | null;
  className?: string;
}

const STATUS_COLOR: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  running: "bg-emerald-500/15 text-emerald-600",
  paused: "bg-amber-500/15 text-amber-600",
  completed: "bg-blue-500/15 text-blue-600",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DebugConsole({
  workspaceId,
  workflowId,
  className,
}: DebugConsoleProps) {
  const sessionQuery = useDebugSession(workspaceId, workflowId);
  const mutation = useMutateDebugSession();

  const session = sessionQuery.data;
  const log = React.useMemo<DebugLogEntry[]>(() => {
    if (!session?.log) return [];
    const raw = session.log as unknown;
    if (Array.isArray(raw)) return raw as DebugLogEntry[];
    return [];
  }, [session]);

  return (
    <aside
      className={cn(
        "flex w-full flex-col border-l bg-background/40 sm:w-80",
        className,
      )}
      aria-label="Debug console"
    >
      <header className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Debug</h2>
        </div>
        {session && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] uppercase font-semibold",
              STATUS_COLOR[session.status] ?? STATUS_COLOR.idle,
            )}
          >
            {session.status}
          </span>
        )}
      </header>
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={!workflowId || !workspaceId || mutation.isPending}
          onClick={() =>
            workflowId &&
            workspaceId &&
            mutation.mutate({ workflowId, workspaceId, action: "start" })}
        >
          <Play className="mr-1 size-3.5" /> Start
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={!session || session.status !== "running" || mutation.isPending}
          onClick={() =>
            workflowId &&
            workspaceId &&
            mutation.mutate({ workflowId, workspaceId, action: "pause" })}
        >
          <Pause className="mr-1 size-3.5" /> Pause
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={!session || session.status !== "paused" || mutation.isPending}
          onClick={() =>
            workflowId &&
            workspaceId &&
            mutation.mutate({ workflowId, workspaceId, action: "resume" })}
        >
          <Play className="mr-1 size-3.5" /> Resume
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          disabled={!session || session.status === "completed" || mutation.isPending}
          onClick={() =>
            workflowId &&
            workspaceId &&
            mutation.mutate({ workflowId, workspaceId, action: "stop" })}
        >
          <Square className="mr-1 size-3.5" /> Stop
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-3 pt-0 font-mono text-xs">
          {sessionQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : log.length === 0 ? (
            <p className="text-muted-foreground">
              No log entries yet. Start a debug run to capture trace output.
            </p>
          ) : (
            log.map((entry, i) => (
              <div key={i} className="flex flex-col gap-0.5 border-l-2 border-border pl-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {formatTime(entry.ts)}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {entry.event}
                  </span>
                </div>
                <span className="text-foreground">{entry.nodeKey}</span>
                {entry.message && (
                  <span className="text-muted-foreground">{entry.message}</span>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
