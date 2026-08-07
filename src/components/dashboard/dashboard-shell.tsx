"use client";

/**
 * Supa AI — Dashboard shell.
 *
 * The application chrome that wraps every in-page dashboard section. It is
 * a client component because it owns three pieces of UI state that cannot
 * live in a server component:
 *
 *   1. Mobile sidebar open state (Sheet on `< md`).
 *   2. Command-menu open state (⌘K / Ctrl+K).
 *   3. The currently active dashboard section (lifted into props so the
 *      parent `SectionRouter` can swap content).
 *
 * Layout:
 *
 *   ```
 *   <div min-h-screen flex flex-col>            ← root wrapper (sticky footer)
 *     <DashboardTopbar />                       ← sticky
 *     <div flex flex-1>
 *       <aside hidden md:flex w-64> Sidebar </aside>
 *       <main flex-1> {children} </main>
 *     </div>
 *     <DashboardFooter />                       ← mt-auto
 *   </div>
 *   ```
 *
 * On mobile the sidebar renders inside a Sheet (slid from the left) that is
 * controlled by the topbar's Menu trigger.
 *
 * @module @/components/dashboard/dashboard-shell
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/auth";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/shared/logo";
import { DashboardTopbar } from "./dashboard-topbar";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardFooter } from "./dashboard-footer";
import { CommandMenu } from "./command-menu";
import type { SectionId } from "./nav-config";

export interface DashboardShellProps {
  /** The authenticated user, or `null` when signed out. */
  user: AuthUser | null;
  /** Currently-active section id. */
  activeSection: SectionId;
  /** Called when the user picks a different section (sidebar / ⌘K / user menu). */
  onSectionChange: (id: SectionId) => void;
  /** Runtime environment label (threaded to the client-only footer). */
  environment: "development" | "staging" | "production";
  /** The section content. */
  children: React.ReactNode;
  className?: string;
}

export function DashboardShell({
  user,
  activeSection,
  onSectionChange,
  environment,
  children,
  className,
}: DashboardShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);

  const navigate = React.useCallback(
    (id: SectionId) => {
      onSectionChange(id);
      setMobileSidebarOpen(false);
    },
    [onSectionChange],
  );

  return (
    <div className={cn("flex min-h-screen flex-col bg-background", className)}>
      <DashboardTopbar
        user={user}
        onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        onOpenCommandMenu={() => setCommandOpen(true)}
        // Logo click returns to the user dashboard overview (the new
        // post-login landing surface, replacing the Phase 1 foundation
        // dashboard as the default home).
        onNavigateHome={() => navigate("overview")}
        onNavigate={navigate}
      />

      <div className="flex flex-1">
        {/* Desktop sidebar — persistent on md+. Sticky below the topbar so it
            stays visible while the main content scrolls naturally (the
            footer is pushed down by `mt-auto` on long pages, per spec). */}
        <aside
          className={cn(
            "hidden w-64 shrink-0 border-r bg-sidebar/30 md:block md:flex md:flex-col",
            "sticky top-14 self-start h-[calc(100vh-3.5rem)]",
          )}
          aria-label="Primary navigation"
        >
          <div className="flex h-14 items-center border-b px-4">
            <Logo size={24} withWordmark />
          </div>
          <DashboardSidebar
            active={activeSection}
            onNavigate={navigate}
          />
        </aside>

        {/* Mobile sidebar — Sheet */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-14 items-center border-b px-4">
              <Logo size={24} withWordmark />
            </div>
            <DashboardSidebar
              active={activeSection}
              onNavigate={navigate}
              onNavigateClose={() => setMobileSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Main content — body scrolls naturally; footer pushes down */}
        <main
          className="flex-1 bg-background scrollbar-thin"
          id="dashboard-main"
        >
          {children}
        </main>
      </div>

      <DashboardFooter environment={environment} />

      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigate={navigate}
      />
    </div>
  );
}
