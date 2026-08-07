"use client";

/**
 * Supa AI — Settings / Sessions section.
 *
 * Lists every active session for the caller (multi-device management):
 *
 *   - Device icon (desktop / mobile / tablet) derived from `device_type`.
 *   - Browser + OS summary.
 *   - IP address (when available; masked "unknown" otherwise).
 *   - Coarse geo location (when available).
 *   - Relative "last active" timestamp.
 *   - "Current" badge for the active session.
 *   - "Revoke" button per session (disabled + tooltip on the current one).
 *   - "Revoke all other sessions" button at the top.
 *
 * Every destructive action is gated by an `AlertDialog` confirmation.
 *
 * @module @/components/settings/sections/sessions-section
 */
import * as React from "react";
import {
  Globe,
  Laptop,
  Loader2,
  MonitorSmartphone,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils/index";
import type { UserSession } from "@/lib/auth";
import {
  useListSessions,
  useRevokeAllSessions,
  useRevokeSession,
  type SettingsApiError,
} from "@/hooks/use-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/empty-state";

/** Static lookup map for device-type → icon. Keys are lowercased. */
const DEVICE_ICONS: Record<string, typeof Laptop> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Laptop,
};

export function SessionsSection() {
  const { data, isLoading, isError, error, refetch } = useListSessions();
  const revokeSession = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = React.useState(false);

  const sessions = data?.sessions ?? [];
  const currentSessionId = data?.currentSessionId ?? null;

  async function onRevoke(sessionId: string) {
    setPendingId(sessionId);
    try {
      await revokeSession.mutateAsync(sessionId);
      toast.success("Session revoked", {
        description: "That device has been signed out.",
      });
    } catch (err) {
      const apiErr = err as SettingsApiError;
      toast.error("Couldn't revoke session", {
        description: apiErr?.message ?? "Please try again.",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function onRevokeAll() {
    setConfirmingAll(true);
    try {
      await revokeAll.mutateAsync();
      toast.success("Other sessions revoked", {
        description: "Every other device has been signed out.",
      });
    } catch (err) {
      const apiErr = err as SettingsApiError;
      toast.error("Couldn't revoke sessions", {
        description: apiErr?.message ?? "Please try again.",
      });
    } finally {
      setConfirmingAll(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={Globe}
        title="Couldn't load sessions"
        description={(error as SettingsApiError)?.message ?? "Please try again."}
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        title="No active sessions"
        description="You're not signed in on any device right now."
      />
    );
  }

  const otherCount = sessions.filter((s) => s.session_token_hash !== currentSessionId).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Active sessions</p>
          <p className="text-xs text-muted-foreground">
            {sessions.length} active · {otherCount} other device{otherCount === 1 ? "" : "s"}
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={otherCount === 0 || revokeAll.isPending || confirmingAll}
            >
              {revokeAll.isPending || confirmingAll ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Revoke all other sessions
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke all other sessions?</AlertDialogTitle>
              <AlertDialogDescription>
                Every other device you're signed in on will be signed out immediately.
                You'll stay signed in on this device.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void onRevokeAll();
                }}
              >
                {revokeAll.isPending ? "Revoking…" : "Revoke all"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <ul className="divide-y rounded-lg border">
        {sessions.map((session) => {
          const isCurrent = session.session_token_hash === currentSessionId;
          return (
            <SessionRow
              key={session.id}
              session={session}
              isCurrent={isCurrent}
              pending={pendingId === session.id}
              onRevoke={() => void onRevoke(session.id)}
            />
          );
        })}
      </ul>
    </div>
  );
}

interface SessionRowProps {
  session: UserSession;
  isCurrent: boolean;
  pending: boolean;
  onRevoke: () => void;
}

function SessionRow({ session, isCurrent, pending, onRevoke }: SessionRowProps) {
  const Icon = DEVICE_ICONS[session.device_type ?? ""] ?? MonitorSmartphone;
  const summary = [session.browser, session.os].filter(Boolean).join(" · ") || "Unknown browser";
  const location = session.location?.trim() || null;
  const ip = session.ip_address?.trim() || null;

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium truncate">{summary}</p>
            {isCurrent ? (
              <Badge variant="default" className="bg-brand text-brand-foreground">
                Current
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {location ? <span>{location}</span> : null}
            {location && ip ? <span className="mx-1.5">·</span> : null}
            {ip ? <span className="font-mono">{ip}</span> : null}
            {!location && !ip ? <span>No location data</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Last active {formatRelativeTime(session.last_active_at)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        {isCurrent ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex">
                <Button variant="ghost" size="sm" disabled>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Revoke
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>This is your current session</TooltipContent>
          </Tooltip>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                className="text-destructive hover:text-destructive"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                Revoke
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  The device will be signed out immediately and need to sign in again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={cn(
                    "bg-destructive text-white hover:bg-destructive/90",
                    "focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    onRevoke();
                  }}
                >
                  Revoke session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </li>
  );
}
