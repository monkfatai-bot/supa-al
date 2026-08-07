"use client";

/**
 * Supa AI — Notification item.
 *
 * Presentational row for a single {@link Notification}. Maps the canonical
 * notification-type set to a Lucide icon, formats `created_at` as a relative
 * time, and visually distinguishes unread notifications (bold + left border
 * accent) from read ones (muted).
 *
 * Phase 2 scope: the row is **display-only**. The spec calls for a click
 * → mark-as-read PATCH, but the dedicated notifications API route is not
 * wired yet — so clicking the row surfaces a tooltip ("Click to read")
 * and does not mutate state. The mark-read API will be wired by the
 * orchestrator.
 *
 * @module @/components/dashboard/notification-item
 */
import * as React from "react";
import {
  CreditCard,
  Info,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatDate,
  formatRelativeTime,
  truncate,
} from "@/lib/utils/index";
import type { Notification } from "@/lib/auth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Maps a `type` value to its Lucide icon. Falls back to `Info`. */
const TYPE_ICON: Readonly<Record<string, LucideIcon>> = {
  welcome: Sparkles,
  security: Shield,
  billing: CreditCard,
  system: Info,
  social: Users,
};

/** Maps a `type` value to its icon medallion color. */
const TYPE_CLASS: Readonly<Record<string, string>> = {
  welcome: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  security: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  billing: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  system: "bg-muted text-foreground",
  social: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
};

export interface NotificationItemProps {
  /** The notification row to render. */
  notification: Notification;
  /** Extra class names on the row. */
  className?: string;
}

/**
 * Render a single notification row. Purely presentational — no client
 * state, no fetches. The `"use client"` directive lets it compose inside
 * interactive parents (tooltips require a client context).
 */
export function NotificationItem({
  notification,
  className,
}: NotificationItemProps) {
  const Icon = TYPE_ICON[notification.type] ?? Info;
  const typeClass = TYPE_CLASS[notification.type] ?? TYPE_CLASS.system;
  const isUnread = !notification.is_read;
  const relative = formatRelativeTime(notification.created_at);
  const absolute = formatDate(notification.created_at, {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li
          className={cn(
            "flex items-start gap-3 rounded-md px-2 py-2",
            "transition-colors hover:bg-muted/40",
            isUnread &&
              "border-l-2 border-l-brand bg-brand/5 pl-3 hover:bg-brand/10",
            className,
          )}
          role="button"
          tabIndex={0}
          aria-label={`${notification.title} — ${isUnread ? "unread" : "read"}`}
          aria-pressed={isUnread}
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md",
              typeClass,
            )}
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <p
                className={cn(
                  "truncate text-sm",
                  isUnread ? "font-semibold" : "font-medium text-muted-foreground",
                )}
              >
                {notification.title}
              </p>
              <time
                dateTime={notification.created_at}
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  isUnread ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {relative}
              </time>
            </div>
            <p
              className={cn(
                "text-xs text-pretty",
                isUnread ? "text-foreground/80" : "text-muted-foreground",
              )}
            >
              {truncate(notification.message, 160)}
            </p>
          </div>
        </li>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isUnread ? "Click to read" : absolute}
      </TooltipContent>
    </Tooltip>
  );
}
