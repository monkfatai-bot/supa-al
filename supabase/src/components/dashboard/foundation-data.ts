/**
 * Supa AI — Foundation data snapshot.
 *
 * Serializable snapshot of the platform's runtime configuration assembled by
 * the server component (`src/app/page.tsx`) from real lib calls
 * (`ai.listAvailable()`, `billing.listAvailableProviders()`,
 * `flagService.listFlags()`, `env`, and the constant catalogs).
 *
 * The snapshot is passed as a prop to the dashboard overview and the
 * settings panel so client components can render real configuration without
 * importing server-only modules.
 *
 * IMPORTANT — every field below is safe to render in the DOM and to ship to
 * the browser bundle. No raw secrets ever appear here; "configured" booleans
 * and masked previews (`••••` / `first4…last4`) are the only secret-derived
 * information that crosses the server/client boundary.
 *
 * @module @/components/dashboard/foundation-data
 */
import type { AiProviderId } from "@/lib/constants/ai";
import type { PaymentProviderId } from "@/lib/constants/billing";
import type { Plan } from "@/lib/billing/types";
import type { FeatureFlagStatus } from "@/lib/feature-flags";
import type { RATE_LIMIT_PRESETS } from "@/lib/constants/security";

/** Status of one AI provider — configured? base URL? masked key preview. */
export interface AiProviderStatus {
  id: AiProviderId;
  label: string;
  docsUrl: string;
  /** `true` when an API key is set for this provider in env. */
  configured: boolean;
  /** Base URL when the provider uses one, else `null`. */
  baseUrl: string | null;
  /** Masked key preview — NEVER the raw key. */
  keyPreview: string;
  /** `true` when this provider is the configured default. */
  isDefault: boolean;
}

/** Status of one payment provider — configured? default? regions. */
export interface PaymentProviderStatus {
  id: PaymentProviderId;
  label: string;
  /** `true` when a secret key is set for this provider in env. */
  configured: boolean;
  isDefault: boolean;
  supportedRegions: readonly string[];
}

/** Masked status of a single secret (auth / JWT / encryption). */
export interface SecretStatus {
  /** `true` when the secret meets the env-schema minimum length. */
  configured: boolean;
  /**
   * Either "Not configured" or a `first4…last4` style preview. NEVER the
   * full secret.
   */
  maskedPreview: string;
}

/** A foundation module status row (used in the overview grid). */
export interface FoundationModule {
  id: string;
  name: string;
  description: string;
  /** Relative path to the lib file. */
  path: string;
  status: "ok" | "warning" | "disabled";
}

/** The full snapshot. */
export interface FoundationData {
  appName: string;
  appUrl: string;
  environment: "development" | "staging" | "production";
  version: string;
  defaultAiProvider: string;
  defaultAiModel: string;
  defaultPaymentProvider: PaymentProviderId;
  defaultCurrency: string;
  redisEnabled: boolean;
  supabaseConfigured: boolean;
  aiProviders: AiProviderStatus[];
  paymentProviders: PaymentProviderStatus[];
  plans: readonly Plan[];
  rateLimitPresets: typeof RATE_LIMIT_PRESETS;
  uploadMaxBytes: number;
  uploadAllowedMimeTypes: readonly string[];
  featureFlags: readonly FeatureFlagStatus[];
  authSecret: SecretStatus;
  jwtSecret: SecretStatus;
  encryptionKey: SecretStatus;
  modules: readonly FoundationModule[];
}
