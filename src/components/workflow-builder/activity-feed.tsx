"use client";

import { useEffect, useRef, useMemo } from "react";
import { Activity, Trash2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useWorkflowBuilderStore } from "@/services/workflow-builder/store";
import type { ActivityFeedEntry } from "@/services/workflow-builder/types";

// ─── Helpers ────────────────────────────────────────────────

/**
 * Parse an ISO-8601 timestamp and return a human-readable relative
 * or time-of-day string.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Return a date-group key like "Today", "Yesterday", or "Aug 6, 2025".
 */
function getDateGroup(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entryDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (today.getTime() - entryDay.getTime()) / 86400000,
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Derive initials from a user name for the avatar fallback.
 */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Map common action codes to icon-friendly labels.
 */
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    node_added: "added a node",
    node_deleted: "removed a node",
    node_updated: "updated a node",
    edge_added: "connected nodes",
    edge_deleted: "disconnected nodes",
    edge_updated: "updated a connection",
    workflow_published: "published the workflow",
    workflow_created: "created the workflow",
    workflow_saved: "saved changes",
    comment_added: "added a comment",
    comment_resolved: "resolved a comment",
    validation_run: "ran validation",
  };
  return map[action] ?? action.replace(/_/g, " ");
}

// ─── Sub-components ──────────────────────────────────────────

function ActivityItem({ entry }: { entry: ActivityFeedEntry }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-1">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        {entry.userAvatar && (
          <AvatarImage src={entry.userAvatar} alt={entry.userName} />
        )}
        <AvatarFallback className="text-[10px] bg-muted">
          {getInitials(entry.userName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          <span className="font-medium text-foreground">
            {entry.userName}
          </span>{" "}
          <span className="text-muted-foreground">{actionLabel(entry.action)}</span>
        </p>
        {entry.details && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {entry.details}
          </p>
        )}
      </div>

      <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 mt-0.5">
        <Clock className="h-3 w-3" />
        {formatTimestamp(entry.timestamp)}
      </span>
    </div>
  );
}

function DateGroupHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm pt-2 pb-1 px-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <Separator className="mt-1" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Activity className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        No activity yet
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Changes made to this workflow will appear here.
      </p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function ActivityFeed() {
  const activityFeed = useWorkflowBuilderStore((s) => s.activityFeed);
  const setActivityFeed = useWorkflowBuilderStore((s) => s.setActivityFeed);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group activities by date
  const grouped = useMemo(() => {
    const groups: { dateKey: string; entries: ActivityFeedEntry[] }[] = [];
    let currentKey = "";

    for (const entry of activityFeed) {
      const key = getDateGroup(entry.timestamp);
      if (key !== currentKey) {
        groups.push({ dateKey: key, entries: [entry] });
        currentKey = key;
      } else {
        groups[groups.length - 1].entries.push(entry);
      }
    }

    return groups;
  }, [activityFeed]);

  // Auto-scroll to bottom when new activities arrive
  const feedLength = activityFeed.length;
  const prevLengthRef = useRef(feedLength);

  useEffect(() => {
    if (feedLength > prevLengthRef.current && scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
    prevLengthRef.current = feedLength;
  }, [feedLength]);

  const handleClear = () => {
    setActivityFeed([]);
  };

  return (
    <Card className="h-full flex flex-col border-0 shadow-none rounded-lg">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 shrink-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Activity
          {activityFeed.length > 0 && (
            <span className="ml-1 text-[11px] font-normal text-muted-foreground tabular-nums">
              {activityFeed.length}
            </span>
          )}
        </CardTitle>
        {activityFeed.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleClear}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </CardHeader>

      <Separator />

      <CardContent className="flex-1 p-0 overflow-hidden">
        {activityFeed.length === 0 ? (
          <EmptyState />
        ) : (
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="px-3 pb-3">
              {grouped.map((group) => (
                <div key={group.dateKey}>
                  <DateGroupHeader label={group.dateKey} />
                  {group.entries.map((entry) => (
                    <ActivityItem key={entry.id} entry={entry} />
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
