"use client";

/**
 * Supa AI — Settings / Appearance section.
 *
 * Lets the user pick a theme (light / dark / system) wired to `next-themes`,
 * and surfaces two Phase-1 placeholders (density toggle + accent color
 * note) that ship as disabled controls with "Phase 2" markers.
 *
 * @module @/components/settings/sections/appearance-section
 */
import * as React from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ComingSoon } from "@/components/shared/coming-soon";

type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: Array<{
  value: ThemeOption;
  label: string;
  icon: typeof Sun;
  description: string;
}> = [
  {
    value: "light",
    label: "Light",
    icon: Sun,
    description: "Bright surfaces, dark text — best in daylight.",
  },
  {
    value: "dark",
    label: "Dark",
    icon: Moon,
    description: "Dim surfaces, light text — best in low light.",
  },
  {
    value: "system",
    label: "System",
    icon: Monitor,
    description: "Match your OS preference automatically.",
  },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Stable placeholder until mounted to avoid hydration mismatch.
  const current = mounted ? (theme as ThemeOption | undefined) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium">Theme</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose how Supa AI looks to you. System mode follows your operating-system preference.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => {
          const isActive = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={!mounted}
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                "min-h-[5rem]",
                isActive
                  ? "border-brand bg-brand-muted/30"
                  : "border-border hover:bg-muted/60",
                !mounted && "opacity-60",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-md bg-muted">
                  <option.icon className="size-4" aria-hidden="true" />
                </span>
                {isActive ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                ) : null}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="density-compact" className="flex items-center gap-2 text-sm">
              Compact density
              <ComingSoon />
            </Label>
            <p className="text-xs text-muted-foreground">
              Tighten paddings and row heights for power users on large screens.
            </p>
          </div>
          <Switch id="density-compact" disabled aria-label="Compact density (coming soon)" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="accent-color" className="flex items-center gap-2 text-sm">
              Accent color
              <ComingSoon />
            </Label>
            <p className="text-xs text-muted-foreground">
              Currently locked to <span className="text-brand font-medium">emerald</span>.
              Custom accent pickers arrive in a later phase.
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5">
            <span className="size-3.5 rounded-full bg-brand" aria-hidden="true" />
            <span className="text-xs font-medium">Emerald</span>
          </div>
        </div>
      </div>
    </div>
  );
}
