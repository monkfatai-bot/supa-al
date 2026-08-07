"use client";

/**
 * Supa AI — `useMediaQuery`.
 *
 * Generic SSR-safe media-query hook. Returns `false` during the first render
 * (when `window` is undefined) and the resolved match on the client. Callers
 * that need a stable initial value to avoid hydration mismatches should
 * accept the brief `false` → resolved transition.
 *
 * @module @/hooks/use-media-query
 */
import * as React from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
