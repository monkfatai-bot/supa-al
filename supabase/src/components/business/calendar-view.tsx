"use client";

/**
 * Supa AI — Phase 10 Business AI Suite — Calendar view.
 *
 * A simple chronological list of upcoming calendar events for the
 * active workspace. Each row shows the date, time, title, type, and
 * optional location.
 *
 * The view is deliberately NOT a full month-grid calendar — the
 * underlying API returns a flat list and a grid would require
 * significantly more layout code. A simple list is a clean MVP.
 *
 * @module @/components/business/calendar-view
 */
import * as React from "react";
import {
  Bell,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Milestone,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  CalendarEvent,
  CalendarEventType,
} from "@/lib/business/client";
import { useCalendarEvents } from "@/hooks/use-business";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/index";

const TYPE_ICON: Record<CalendarEventType, typeof Bell> = {
  event: CalendarIcon,
  meeting: Users,
  reminder: Bell,
  deadline: Milestone,
  task: Bell,
  milestone: Milestone,
  other: CalendarIcon,
};

const TYPE_BADGE: Record<CalendarEventType, string> = {
  event: "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300",
  meeting:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  reminder:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  deadline:
    "border-transparent bg-destructive/10 text-destructive dark:text-red-400",
  task: "border-transparent bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  milestone:
    "border-transparent bg-purple-500/10 text-purple-700 dark:text-purple-300",
  other: "border-transparent bg-muted text-muted-foreground",
};

export interface CalendarViewProps {
  workspaceId: string;
  className?: string;
}

export function CalendarView({ workspaceId, className }: CalendarViewProps) {
  const eventsQuery = useCalendarEvents(workspaceId, { limit: 100 });

  const grouped = React.useMemo(() => {
    const list = (eventsQuery.data ?? []).slice().sort((a, b) => {
      return (
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    });
    const buckets = new Map<string, CalendarEvent[]>();
    for (const ev of list) {
      const dayKey = ev.start_time.slice(0, 10);
      const arr = buckets.get(dayKey) ?? [];
      arr.push(ev);
      buckets.set(dayKey, arr);
    }
    return Array.from(buckets.entries());
  }, [eventsQuery.data]);

  return (
    <div className={cn("space-y-4 p-4 sm:p-6 lg:p-8", className)}>
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
          Calendar
        </h2>
        <p className="text-sm text-muted-foreground">
          Upcoming events, meetings, deadlines, and milestones.
        </p>
      </header>

      {eventsQuery.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : eventsQuery.isError ? (
        <EmptyState
          icon={CalendarIcon}
          title="Couldn't load calendar"
          description="Please try again later."
        />
      ) : (eventsQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="No upcoming events"
          description="Schedule meetings, deadlines, and milestones — they'll show up here in chronological order."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, evs]) => (
            <div key={day} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {formatDate(day, { dateStyle: "full" })}
                </h3>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {evs.map((ev) => (
                  <CalendarEventRow key={ev.id} event={ev} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarEventRow({ event }: { event: CalendarEvent }) {
  const type = (event.type as CalendarEventType) ?? "event";
  const Icon = TYPE_ICON[type] ?? CalendarIcon;
  const start = new Date(event.start_time);
  const timeLabel = event.all_day
    ? "All day"
    : start.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
  const endLabel = !event.all_day && event.end_time
    ? new Date(event.end_time).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{event.title}</p>
          <Badge
            variant="outline"
            className={cn("capitalize", TYPE_BADGE[type])}
          >
            {type}
          </Badge>
        </div>
        {event.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {event.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            {timeLabel}
            {endLabel ? ` → ${endLabel}` : ""}
          </span>
          {event.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {event.location}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
