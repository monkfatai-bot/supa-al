"use client";

/**
 * Supa AI — `useUser`.
 *
 * Client-side hook that fetches the current user from `/api/auth/me` via
 * TanStack Query. The hook is intentionally dumb about caching strategy —
 * it defers to the QueryProvider's defaults (30s staleTime, 1 retry) so a
 * tab-swap doesn't refetch unnecessarily.
 *
 * Returns `{ user, isLoading, isAuthenticated }` where:
 *
 *   - `isLoading` is `true` only during the very first fetch (subsequent
 *     background refetches keep the previous user visible).
 *   - `isAuthenticated` is `true` only when a non-null user resolved.
 *
 * @module @/hooks/use-user
 */
import { useQuery } from "@tanstack/react-query";

import type { AuthUser } from "@/lib/auth";

interface MeResponse {
  user: AuthUser | null;
  error?: string;
}

async function fetchMe(signal: AbortSignal): Promise<MeResponse> {
  const res = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    signal,
  });
  // 401 is a valid response — it means "not signed in", not a transport error.
  if (res.status === 401) return { user: null };
  if (!res.ok) {
    throw new Error(`Failed to load session (${res.status}).`);
  }
  return (await res.json()) as MeResponse;
}

export interface UseUserResult {
  user: AuthUser | null;
  /** `true` only during the initial fetch; `false` during background refetches. */
  isLoading: boolean;
  /** `true` only when a non-null user resolved. */
  isAuthenticated: boolean;
  /** `true` while a background refetch is in flight. */
  isFetching: boolean;
  /** Manually trigger a refetch (e.g. after sign-in). */
  refetch: () => Promise<unknown>;
}

export function useUser(): UseUserResult {
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: ({ signal }) => fetchMe(signal),
    retry: 1,
    staleTime: 60 * 1000,
  });

  const user = query.data?.user ?? null;
  return {
    user,
    isLoading: query.isLoading,
    isAuthenticated: user !== null,
    isFetching: query.isFetching,
    refetch: () => query.refetch(),
  };
}
