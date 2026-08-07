"use client";

/**
 * Supa AI — Activity log item.
 *
 * Presentational row for a single {@link ActivityLog} entry. Maps the
 * canonical event-type union to a Lucide icon + a human-readable label,
 * formats `created_at` as a relative time, and surfaces the IP address
 * (when present) as a muted secondary detail.
 *
 * The full timestamp is exposed via a hover `Tooltip` so a power user can
 * see the exact moment an event happened without expanding a row.
 *
 * Severity colors the icon medallion:
 *   - `info` / `debug` → muted
 *   - `warn`           → amber
 *   - `error`          → destructive
 *   - `critical`       → destructive (also pulses)
 *
 * @module @/components/dashboard/activity-item
 */
import * as React from "react";
import {
  AlertTriangle,
  BadgeCheck,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  Mail,
  ShieldX,
  Trash2,
  UserCog,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatDate,
  formatRelativeTime,
} from "@/lib/utils/index";
import type { ActivityLog } from "@/lib/auth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Maps an `event_type` to its Lucide icon. Falls back to `UserCog`. */
const EVENT_ICON: Readonly<Record<string, LucideIcon>> = {
  signup: UserPlus,
  login: LogIn,
  logout: LogOut,
  password_reset: KeyRound,
  email_change: Mail,
  profile_update: UserCog,
  failed_login: AlertTriangle,
  account_deleted: Trash2,
  oauth_link: Link2,
  session_revoked: ShieldX,
  password_change: KeyRound,
  email_verified: BadgeCheck,
};

/** Maps an `event_type` to a human-readable label. */
const EVENT_LABEL: Readonly<Record<string, string>> = {
  signup: "Account created",
  login: "Signed in",
  logout: "Signed out",
  password_reset: "Password reset",
  email_change: "Email address changed",
  profile_update: "Profile updated",
  failed_login: "Failed sign-in attempt",
  account_deleted: "Account deleted",
  oauth_link: "OAuth provider linked",
  session_revoked: "Session revoked",
  password_change: "Password changed",
  email_verified: "Email verified",
};

/** Severity → icon medallion color. */
const SEVERITY_CLASS: Readonly<Record<string, string>> = {
  debug: "bg-muted text-muted-foreground",
  info: "bg-muted text-foreground",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "bg-destructive/10 text-destructive dark:text-red-400",
  critical: "bg-destructive/10 text-destructive dark:text-red-400",
};

export interface ActivityItemProps {
  /** The activity-log row to render. */
  log: ActivityLog;
  /** Extra class names on the row. */
  className?: string;
}

/**
 * Render a single activity-log row. Purely presentational — no client
 * state, no fetches. The `"use client"` directive lets it compose inside
 * interactive parents (tooltips require a client context).
 */
export function ActivityItem({ log, className }: ActivityItemProps) {
  const Icon = EVENT_ICON[log.event_type] ?? UserCog;
  const label = EVENT_LABEL[log.event_type] ?? prettifyEventType(log.event_type);
  const severityClass = SEVERITY_CLASS[log.severity] ?? SEVERITY_CLASS.info;
  const relative = formatRelativeTime(log.created_at);
  const absolute = formatDate(log.created_at, {
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
            className,
          )}
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md",
              severityClass,
            )}
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{label}</p>
              <time
                dateTime={log.created_at}
                className="shrink-0 text-xs text-muted-foreground tabular-nums"
              >
                {relative}
              </time>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5",
                  "bg-muted text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
                )}
              >
                {log.severity}
              </span>
              {log.ip_address ? (
                <span className="font-mono text-[11px]">
                  IP {log.ip_address}
                </span>
              ) : null}
              {log.user_agent ? (
                <span className="truncate text-[11px] opacity-80">
                  {log.user_agent}
                </span>
              ) : null}
            </div>
          </div>
        </li>
      </TooltipTrigger>
      <TooltipContent side="top">{absolute}</TooltipContent>
    </Tooltip>
  );
}

/** Convert a raw `event_type` slug into a readable label (fallback). */
function prettifyEventType(slug: string): string {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
