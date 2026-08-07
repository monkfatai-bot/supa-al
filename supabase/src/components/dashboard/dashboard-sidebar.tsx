"use client";

/**
 * Supa AI — Dashboard sidebar.
 *
 * Renders the grouped dashboard navigation (Workspace / AI Tools / Account)
 * plus a footer slot for the docs link. Used twice:
 *
 *   1. On desktop (`md+`), as a persistent left rail inside `DashboardShell`.
 *   2. On mobile, inside the Sheet that the topbar's menu trigger opens.
 *
 * The component is presentational — it accepts the active section id and a
 * navigation callback so the shell can own the section state. Collapsible
 * groups (shadcn `Collapsible`) let the user fold away sections they don't
 * use often; the collapsed state is local (we don't persist it in Phase 1).
 *
 * @module @/components/dashboard/dashboard-sidebar
 */
import * as React from "react";
import { ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ComingSoon } from "@/components/shared/coming-soon";
import {
  DASHBOARD_NAV,
  SIDEBAR_FOOTER_LINKS,
  type SectionId,
  type DashboardNavItem,
} from "./nav-config";

export interface DashboardSidebarProps {
  active: SectionId;
  onNavigate: (id: SectionId) => void;
  /** When `true`, close the mobile Sheet after a navigation event. */
  onNavigateClose?: () => void;
}

export function DashboardSidebar({
  active,
  onNavigate,
  onNavigateClose,
}: DashboardSidebarProps) {
  return (
    <nav
      aria-label="Dashboard navigation"
      className="flex h-full flex-col gap-2 overflow-y-auto scrollbar-thin px-3 py-4"
    >
      <div className="flex-1 space-y-4">
        {DASHBOARD_NAV.map((group) => (
          <CollapsibleGroup
            key={group.label}
            label={group.label}
            items={group.items}
            active={active}
            onNavigate={(id) => {
              onNavigate(id);
              onNavigateClose?.();
            }}
          />
        ))}
      </div>

      <div className="border-t pt-3">
        <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Resources
        </p>
        <ul className="space-y-1">
          {SIDEBAR_FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <link.icon className="size-4" aria-hidden="true" />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

interface CollapsibleGroupProps {
  label: string;
  items: ReadonlyArray<DashboardNavItem>;
  active: SectionId;
  onNavigate: (id: SectionId) => void;
}

function CollapsibleGroup({
  label,
  items,
  active,
  onNavigate,
}: CollapsibleGroupProps) {
  const hasActive = items.some((item) => item.id === active);
  // Default to open if the group contains the active item.
  const [open, setOpen] = React.useState(hasActive);

  // Re-open if a sibling section becomes active (e.g. via ⌘K).
  React.useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-full justify-between px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          {label}
          <ChevronsUpDown className="size-3.5" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-0.5">
        {items.map((item) => {
          const isActive = item.id === active;
          const isDisabled = Boolean(item.comingSoon || item.disabled);
          return (
            <button
              key={item.id}
              type="button"
              disabled={isDisabled}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                "min-h-11 text-left",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                isDisabled && "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-muted-foreground",
              )}
              title={item.description}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0",
                  isActive ? "text-brand" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{item.label}</span>
              {item.comingSoon ? <ComingSoon /> : null}
            </button>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
