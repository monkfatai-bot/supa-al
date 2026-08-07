"use client";

/**
 * Supa AI — Phase 10 Integration Hub — integration logs.
 *
 * Paginated, filterable list of integration log entries. Filters by
 * level + free-text search.
 *
 * @module @/components/integrations/integration-logs
 */
import * as React from "react";
import { ScrollText } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useIntegrationLogs } from "@/hooks/use-integrations";
import type { IntegrationLogLevel } from "@/lib/integrations/client";

interface IntegrationLogsProps {
  workspaceId: string;
}

const LEVEL_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  debug: "outline",
  info: "default",
  warn: "secondary",
  error: "destructive",
  fatal: "destructive",
};

const LEVELS: IntegrationLogLevel[] = ["debug", "info", "warn", "error", "fatal"];

export function IntegrationLogs({ workspaceId }: IntegrationLogsProps) {
  const [search, setSearch] = React.useState("");
  const [level, setLevel] = React.useState<IntegrationLogLevel | "">("");

  const query = useIntegrationLogs({
    workspaceId,
    search: search.trim() || undefined,
    level: level || undefined,
    limit: 100,
  });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          aria-label="Level"
          value={level}
          onChange={(e) => setLevel(e.target.value as IntegrationLogLevel | "")}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={ScrollText}
          title="Couldn't load logs"
          description="Please try again later."
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No log entries"
          description="Integration activity will appear here as events flow through the hub."
        />
      ) : (
        <ul className="divide-y rounded-md border font-mono text-xs">
          {(query.data ?? []).map((log) => (
            <li key={log.id} className="flex items-start gap-3 p-3">
              <Badge variant={LEVEL_VARIANT[log.level] ?? "outline"} className="shrink-0">
                {log.level}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="font-sans font-medium">{log.message}</p>
                <p className="text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()} · {log.event}
                  {log.integration_id ? ` · ${log.integration_id.slice(0, 8)}` : ""}
                  {typeof log.duration_ms === "number" ? ` · ${log.duration_ms}ms` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
