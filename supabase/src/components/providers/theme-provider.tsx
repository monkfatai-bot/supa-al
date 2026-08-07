"use client";

/**
 * Supa AI — Theme provider.
 *
 * Thin wrapper around `next-themes` `ThemeProvider` so the rest of the app can
 * import a single, opinionated component. We bind the theme to the `class`
 * attribute on `<html>` (matching the `.dark` selector in `globals.css`),
 * default to the user's OS preference, and disable the cross-fade transition
 * on theme change so the swap is instant (avoids a flash of intermediate
 * state when toggling between light/dark).
 *
 * @module @/components/providers/theme-provider
 */
import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
