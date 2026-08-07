/**
 * Supa AI — Feature flag server helpers.
 *
 * Tiny guard layer used by API routes and Server Actions to refuse access
 * when a feature is disabled. Throws {@link AuthorizationError} (HTTP 403)
 * which the global error boundary maps to a clean response.
 *
 * Server-only.
 *
 * @module @/lib/feature-flags/hooks
 */
import { AuthorizationError } from "@/lib/errors";

import {
  type FeatureFlagContext,
  type FeatureFlagName,
  flagService,
} from "./index";

/**
 * Ensure a feature flag is enabled, else throw `AuthorizationError`.
 *
 * ```ts
 * await requireFeature(FEATURE_FLAGS.IMAGE_GENERATION);
 * ```
 *
 * Uses the async override-aware evaluator so admin toggles take effect.
 */
export async function requireFeature(
  flag: FeatureFlagName,
  context?: FeatureFlagContext,
): Promise<void> {
  const enabled = await flagService.isEnabled(flag, context);
  if (!enabled) {
    throw new AuthorizationError(
      "This feature is not enabled.",
      { flag },
    );
  }
}

/**
 * Sync variant — only consults env defaults. Use when you cannot await and
 * admin overrides are not critical (e.g. early in the request lifecycle).
 */
export function requireFeatureSync(flag: FeatureFlagName): void {
  if (!flagService.isEnabledSync(flag)) {
    throw new AuthorizationError("This feature is not enabled.", { flag });
  }
}
