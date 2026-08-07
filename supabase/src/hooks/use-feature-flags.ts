"use client";

/**
 * Supa AI — `useFeatureFlags`.
 *
 * Phase 1 feature flags are evaluated server-side (the values live in
 * `env.features.*` and may be overridden in the KV store). The server
 * component (`src/app/page.tsx`) calls `flagService.listFlags()` and passes
 * the resolved snapshot down as a prop; this hook exposes a tiny client API
 * over that snapshot so client components can ask "is `chat` enabled?".
 *
 * The hook is read-only in Phase 1 — runtime overrides are an admin-only
 * server action that ships in a later phase.
 *
 * @module @/hooks/use-feature-flags
 */
import * as React from "react";

import type { FeatureFlagName, FeatureFlagStatus } from "@/lib/feature-flags";

export interface UseFeatureFlagsResult {
  flags: readonly FeatureFlagStatus[];
  isEnabled: (name: FeatureFlagName) => boolean;
}

export function useFeatureFlags(
  flags: readonly FeatureFlagStatus[],
): UseFeatureFlagsResult {
  const isEnabled = React.useCallback(
    (name: FeatureFlagName): boolean => {
      return flags.find((f) => f.name === name)?.enabled ?? false;
    },
    [flags],
  );

  return { flags, isEnabled };
}
