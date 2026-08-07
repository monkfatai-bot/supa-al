"use client";

/**
 * Supa AI — User menu.
 *
 * Renders an avatar dropdown when a user is signed in (Profile / Settings /
 * Billing / Sign out) and a disabled "Sign in" button when no Supabase auth
 * is configured. The sign-out flow POSTs to `/api/auth/signout` and reloads
 * the page so the server component re-evaluates the session.
 *
 * The `user` prop is the canonical Supabase `User` shape. The avatar's
 * fallback shows the user's initials (derived from email or user metadata);
 * when no avatar URL is supplied we render the initials on a muted tile.
 *
 * @module @/components/dashboard/user-menu
 */
import * as React from "react";
import { LogOut, Settings as SettingsIcon, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface UserMenuProps {
  /** The authenticated user, or `null` when signed out. */
  user: AuthUser | null;
  /** Switch the in-page section to the supplied id. */
  onNavigate?: (id: "settings" | "billing") => void;
}

function initialsFor(user: AuthUser): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === "string" ? meta.full_name : "";
  const name = typeof meta?.name === "string" ? meta.name : "";
  const email = user.email ?? "";
  const source = (fullName || name || email).trim();
  if (!source) return "U";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function displayNameFor(user: AuthUser): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === "string" ? meta.full_name : "";
  const name = typeof meta?.name === "string" ? meta.name : "";
  return (fullName || name || user.email || "Signed in").trim();
}

function avatarUrlFor(user: AuthUser): string | undefined {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const url =
    typeof meta?.avatar_url === "string"
      ? meta.avatar_url
      : typeof meta?.picture === "string"
        ? meta.picture
        : undefined;
  return url;
}

export function UserMenu({ user, onNavigate }: UserMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  if (!user) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="gap-2"
              aria-label="Sign in (disabled — Supabase auth not configured)"
            >
              <UserIcon className="size-4" aria-hidden="true" />
              Sign in
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Configure Supabase Auth to enable sign-in
        </TooltipContent>
      </Tooltip>
    );
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      const res = await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Sign out failed (${res.status}).`);
      }
      toast.success("Signed out");
      router.refresh();
    } catch {
      toast.error("Couldn't sign out — please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-full p-1 pr-2",
            "transition-colors hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
          aria-label="Open user menu"
        >
          <Avatar className="size-8">
            {avatarUrlFor(user) ? <AvatarImage src={avatarUrlFor(user)} alt="" /> : null}
            <AvatarFallback className="text-xs font-medium">
              {initialsFor(user)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium leading-none sm:inline-block">
            {displayNameFor(user).split("@")[0]}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium truncate">{displayNameFor(user)}</span>
          {user.email ? (
            <span className="text-xs text-muted-foreground truncate">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onNavigate?.("settings")}>
          <SettingsIcon className="size-4" aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate?.("settings")}>
          <UserIcon className="size-4" aria-hidden="true" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onSignOut}
          disabled={signingOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
