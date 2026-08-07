"use client";

/**
 * Supa AI — Dashboard topbar.
 *
 * Sticky top bar of the dashboard shell. Renders (left → right):
 *
 *   - Mobile sidebar trigger (Menu icon, only on `< md`).
 *   - Logo + wordmark (always visible — clicking returns to Overview).
 *   - ⌘K command-palette trigger button.
 *   - Spacer.
 *   - Notifications bell (disabled, "Phase 2" tooltip).
 *   - Theme toggle.
 *   - User menu / Sign-in button.
 *
 * The topbar is sticky (`sticky top-0`) so it stays visible while the main
 * content scrolls. It does NOT own the command-palette open state — that
 * lives in the shell so ⌘K can open it from anywhere.
 *
 * @module @/components/dashboard/dashboard-topbar
 */
import * as React from "react";
import { Bell, Menu, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "@/components/shared/logo";
import { ComingSoon } from "@/components/shared/coming-soon";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import type { SectionId } from "./nav-config";
import type { AuthUser } from "@/lib/auth";

export interface DashboardTopbarProps {
  /** Called when the user clicks the mobile menu button. */
  onOpenMobileSidebar: () => void;
  /** Called when the user clicks the command-palette trigger. */
  onOpenCommandMenu: () => void;
  /** Called when the logo / wordmark is clicked. */
  onNavigateHome: () => void;
  /** Called when the user picks Settings / Billing from the user menu. */
  onNavigate: (id: SectionId) => void;
  user: AuthUser | null;
  className?: string;
}

export function DashboardTopbar({
  onOpenMobileSidebar,
  onOpenCommandMenu,
  onNavigateHome,
  onNavigate,
  user,
  className,
}: DashboardTopbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:px-4",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-9 md:hidden"
        onClick={onOpenMobileSidebar}
        aria-label="Open navigation menu"
      >
        <Menu className="size-4" aria-hidden="true" />
      </Button>

      <button
        type="button"
        onClick={onNavigateHome}
        className={cn(
          "flex items-center gap-2 rounded-md px-1 py-1",
          "transition-opacity hover:opacity-80",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        aria-label="Go to dashboard overview"
      >
        <Logo size={26} />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline-block">
          Supa AI
        </span>
      </button>

      <div className="mx-1 h-5 w-px bg-border sm:mx-2" aria-hidden="true" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCommandMenu}
            className="h-9 gap-2 pr-2 pl-2.5 text-muted-foreground"
            aria-label="Open command palette (⌘K)"
          >
            <Search className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Search…</span>
            <kbd
              className={cn(
                "hidden items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex",
              )}
            >
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open command palette (⌘K / Ctrl+K)</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Button
              variant="ghost"
              size="icon"
              disabled
              className="size-9"
              aria-label="Notifications (disabled — coming in Phase 2)"
            >
              <span className="relative">
                <Bell className="size-4" aria-hidden="true" />
              </span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Notifications — coming in Phase 2</TooltipContent>
      </Tooltip>

      <ThemeToggle />

      <UserMenu user={user} onNavigate={onNavigate} />
    </header>
  );
}

/** Convenience export so callers don't import `ComingSoon` separately. */
export { ComingSoon };
