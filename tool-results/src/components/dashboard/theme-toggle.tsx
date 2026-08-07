"use client";

/**
 * Supa AI — Theme toggle.
 *
 * Light / dark / system picker mounted in the dashboard topbar. Uses
 * `next-themes` `useTheme()`; the dropdown renders three radio-style items.
 * A mount guard prevents the SSR hydration mismatch that would otherwise
 * happen because the resolved theme isn't known on the server.
 *
 * @module @/components/dashboard/theme-toggle
 */
import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Render a same-sized placeholder until mounted so the layout doesn't shift
  // when the real icon resolves on the client.
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        disabled
        className="size-9"
      >
        <Sun className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  const isDark = theme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Toggle theme — current: ${theme ?? "system"}`}
          className="size-9"
        >
          {isDark ? (
            <Moon className="size-4" aria-hidden="true" />
          ) : (
            <Sun className="size-4" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="size-4" aria-hidden="true" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="size-4" aria-hidden="true" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="size-4" aria-hidden="true" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
