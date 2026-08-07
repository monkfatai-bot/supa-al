"use client";

/**
 * Supa AI — Phase 12 Runtime — logs viewer.
 *
 * Lists runtime logs with level badges, source, and message. Includes
 * filters by level and source.
 *
 * @module @/components/runtime/runtime-logs
 */
import * as React from "react";
import { ScrollText } from "lucide-react";

import { cn } from "@/lib/utils";
import { useRuntimeLogs } from "@/hooks/use-runtime";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/shared/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_LEVEL_STYLES, formatTime } from "./status-styles";

export interface RuntimeLogsProps {
  workspaceId: string;
  className?: string;
}

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
  { value: "fatal", label: "Fatal" },
];

export function RuntimeLogs({ workspaceId, className }: RuntimeLogsProps) {
  const [level, setLevel] = React.useState<string>("all");
  const [source, setSource] = React.useState<string>("");

  const query = useRuntimeLogs(workspaceId, {
    level: level === "all" ? undefined : level,
    source: source.trim() ? source.trim() : undefined,
    limit: 200,
  });

  // Collect distinct sources from the loaded logs so the source picker
  // stays in sync with what the workspace actually emits.
  const sourceOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const log of query.data ?? []) {
      if (log.source) set.add(log.source);
    }
    return Array.from(set).sort();
  }, [query.data]);

  return (
    <div className={cn("space-y-4", className)}>
      <SectionCard
        title="Runtime logs"
        description="Every runtime log line emitted for this workspace — debug, info, warn, error, and fatal."
        icon={ScrollText}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              list="runtime-log-sources"
              placeholder="Filter by source…"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-8 w-[180px] text-xs"
            />
            <datalist id="runtime-log-sources">
              {sourceOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        }
        contentClassName="p-0"
      >
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <EmptyState
              icon={ScrollText}
              title="Couldn't load logs"
              description="Please try again later."
            />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ScrollText}
              title="No logs yet"
              description="Runtime logs (debug, info, warn, error) will appear here once the runtime starts emitting them."
            />
          </div>
        ) : (
          <ul className="divide-y font-mono">
            {query.data.map((log) => (
              <li
                key={log.id}
                className="flex items-start gap-3 px-4 py-2 text-xs"
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatTime(log.created_at)}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[10px] uppercase tracking-wide font-sans",
                    EVENT_LEVEL_STYLES[log.level] ??
                      "border-transparent bg-muted text-muted-foreground",
                  )}
                >
                  {log.level}
                </Badge>
                <span className="shrink-0 font-sans text-muted-foreground">
                  [{log.source}]
                </span>
                <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">
                  {log.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
