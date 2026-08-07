"use client";

/**
 * Supa AI — Phase 12 Runtime — event viewer.
 *
 * Lists runtime events with level badges (error=red, warn=amber,
 * info=blue), filters by category and level, and expandable event
 * details (payload + metadata).
 *
 * @module @/components/runtime/event-viewer
 */
import * as React from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { RuntimeEvent } from "@/lib/runtime/types";
import { useRuntimeEvents } from "@/hooks/use-runtime";
import { Badge } from "@/components/ui/badge";
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
import { EVENT_LEVEL_STYLES, formatTime, humanize } from "./status-styles";

export interface EventViewerProps {
  workspaceId: string;
  className?: string;
}

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "lifecycle", label: "Lifecycle" },
  { value: "task", label: "Task" },
  { value: "agent", label: "Agent" },
  { value: "workflow", label: "Workflow" },
  { value: "resource", label: "Resource" },
  { value: "error", label: "Error" },
  { value: "recovery", label: "Recovery" },
  { value: "communication", label: "Communication" },
];

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
  { value: "fatal", label: "Fatal" },
];

export function EventViewer({ workspaceId, className }: EventViewerProps) {
  const [category, setCategory] = React.useState<string>("all");
  const [level, setLevel] = React.useState<string>("all");

  const query = useRuntimeEvents(workspaceId, {
    category: category === "all" ? undefined : category,
    level: level === "all" ? undefined : level,
    limit: 200,
  });

  return (
    <div className={cn("space-y-4", className)}>
      <SectionCard
        title="Runtime events"
        description="Every runtime event emitted for this workspace — lifecycle, task, agent, workflow, resource, error, and recovery signals."
        icon={Activity}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          </div>
        }
        contentClassName="p-0"
      >
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <EmptyState
              icon={Activity}
              title="Couldn't load events"
              description="Please try again later."
            />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Activity}
              title="No events yet"
              description="Runtime events (session started, task completed, recovery checkpoint) will appear here once the runtime starts emitting them."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {query.data.map((ev) => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function EventRow({ event }: { event: RuntimeEvent }) {
  const [expanded, setExpanded] = React.useState(false);
  const payload = safeJson(event.payload);
  const metadata = safeJson(event.metadata);
  const hasDetails =
    (payload && Object.keys(payload).length > 0) ||
    (metadata && Object.keys(metadata).length > 0);

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-start gap-3 text-left",
          hasDetails ? "cursor-pointer" : "cursor-default",
        )}
        aria-expanded={expanded}
      >
        {hasDetails ? (
          expanded ? (
            <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )
        ) : (
          <span className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        )}
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-[10px] uppercase tracking-wide",
            EVENT_LEVEL_STYLES[event.level] ??
              "border-transparent bg-muted text-muted-foreground",
          )}
        >
          {event.level}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{event.message}</p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {humanize(event.category)} · {event.event_type}
            {event.source ? ` · ${event.source}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatTime(event.created_at)}
        </span>
      </button>

      {expanded && hasDetails ? (
        <div className="mt-3 ml-7 space-y-2">
          {payload && Object.keys(payload).length > 0 ? (
            <DetailBlock title="Payload" value={payload} />
          ) : null}
          {metadata && Object.keys(metadata).length > 0 ? (
            <DetailBlock title="Metadata" value={metadata} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function DetailBlock({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown>;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <pre className="mt-1 overflow-x-auto text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function safeJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}
