"use client";

/**
 * Supa AI — TanStack Query provider.
 *
 * Mounts a single, stable `QueryClient` per browser session (created once via
 * `useState` so it survives re-renders but is not shared across requests on
 * the server). Sensible defaults:
 *
 *   - `staleTime: 30s`  — most UI surfaces are fine with a half-minute cache.
 *   - `retry: 1`        — one retry on transient failures, not three.
 *   - `refetchOnWindowFocus: false` — the dashboard is the only consumer in
 *     Phase 1 and we don't want noisy refetches when the user tabs back.
 *
 * @module @/components/providers/query-provider
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
