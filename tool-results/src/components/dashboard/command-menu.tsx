"use client";

/**
 * Supa AI — Command menu (⌘K).
 *
 * Quick-switcher that lets the user jump to any dashboard section, toggle
 * the theme, or open external docs without touching the mouse. Built on
 * shadcn `Command` (cmdk) — focus is trapped automatically by the dialog
 * primitive, and Escape closes the dialog (default cmdk behavior).
 *
 * Opens via ⌘K (mac) / Ctrl+K (others). The keyboard binding lives in
 * {@link DashboardTopbar}; this component only owns the open state once
 * opened externally or via the trigger button.
 *
 * @module @/components/dashboard/command-menu
 */
import * as React from "react";
import {
  BookOpen,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { DASHBOARD_NAV, type SectionId } from "./nav-config";

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (id: SectionId) => void;
}

interface CommandAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  hint?: string;
}

export function CommandMenu({
  open,
  onOpenChange,
  onNavigate,
}: CommandMenuProps) {
  const { setTheme } = useTheme();

  function handleSelect(id: SectionId) {
    onNavigate(id);
    onOpenChange(false);
  }

  const themeActions: CommandAction[] = [
    {
      label: "Toggle light theme",
      icon: Sun,
      onSelect: () => {
        setTheme("light");
        onOpenChange(false);
      },
    },
    {
      label: "Toggle dark theme",
      icon: Moon,
      onSelect: () => {
        setTheme("dark");
        onOpenChange(false);
      },
    },
  ];

  const docActions: CommandAction[] = [
    {
      label: "Open documentation",
      icon: BookOpen,
      onSelect: () => {
        if (typeof window !== "undefined") {
          window.open("/docs", "_blank", "noopener,noreferrer");
        }
        onOpenChange(false);
      },
    },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search sections, actions, and quick links."
    >
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {DASHBOARD_NAV.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${group.label} ${item.description ?? ""}`}
                disabled={item.comingSoon || item.disabled}
                onSelect={() => handleSelect(item.id)}
              >
                <item.icon className="size-4" aria-hidden="true" />
                <span>{item.label}</span>
                {item.comingSoon ? (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                    Phase 2
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        <CommandSeparator />

        <CommandGroup heading="Theme">
          {themeActions.map((action) => (
            <CommandItem
              key={action.label}
              value={action.label}
              onSelect={action.onSelect}
            >
              <action.icon className="size-4" aria-hidden="true" />
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Resources">
          {docActions.map((action) => (
            <CommandItem
              key={action.label}
              value={action.label}
              onSelect={action.onSelect}
            >
              <action.icon className="size-4" aria-hidden="true" />
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
