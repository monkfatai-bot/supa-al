/**
 * Supa AI — Flagship `/` route (Phase 11: marketing-aware).
 *
 * An async Server Component that:
 *
 *   1. Resolves the current auth session (gracefully handles `null`).
 *   2. If authenticated → assembles the user dashboard snapshot via
 *      `profileService.getDashboardData()` + the foundation status snapshot,
 *      and hands both to `<SectionRouter>` which renders the dashboard shell
 *      with the user overview as the default landing section.
 *   3. If unauthenticated AND the URL carries an auth intent
 *      (`?signin=1`, `?signup=1`, or `?forgot=1`) → renders `<AuthFlow>`
 *      so the user lands on the auth screen they asked for.
 *   4. If unauthenticated AND no auth intent → renders `<MarketingSite>` so
 *      anonymous visitors see the public marketing surface by default.
 *
 * The foundation data is always assembled (even when authenticated) so the
 * "System Status" section and the foundation-facing settings tabs stay
 * available to signed-in users.
 *
 * @module @/app/page
 */
import type { Metadata } from "next";
import { logger } from "@/lib/logger";
import { env } from "@/lib/config/env";
import { getSession, createProfileService, type AuthUser, type DashboardData } from "@/lib/auth";
import { ai } from "@/lib/ai";
import { billing, type Plan } from "@/lib/billing";
import { PLANS } from "@/lib/billing/plans";
import { flagService } from "@/lib/feature-flags";
import {
  AI_PROVIDERS,
  type AiProviderId,
} from "@/lib/constants/ai";
import {
  PAYMENT_PROVIDERS,
  type PaymentProviderId,
} from "@/lib/constants/billing";
import {
  RATE_LIMIT_PRESETS,
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/constants/security";
import { APP_NAME, APP_VERSION } from "@/lib/constants/app";
import { maskSecret } from "@/lib/security/sanitize";

import { AuthFlow } from "@/components/auth";
import { MarketingSite } from "@/components/marketing";
import { SectionRouter } from "@/components/dashboard/section-router";
import type {
  AiProviderStatus,
  FoundationData,
  FoundationModule,
  PaymentProviderStatus,
  SecretStatus,
} from "@/components/dashboard/foundation-data";

export const dynamic = "force-dynamic";

/** Marketing metadata override for the unauthenticated landing page. */
export const metadata: Metadata = {
  title: `${APP_NAME} — Enterprise AI Platform for Chat, Images, Voice, Video & Workflows`,
  description:
    "Supa AI is the all-in-one enterprise AI platform — chat, image generation, voice, video, AI Employees, workflow builder, business tools, and a marketplace. Built on Supabase. Self-hostable.",
  alternates: { canonical: "/" },
};

/** Masked preview for an AI provider API key — `••••••••{last4}` or "Not configured". */
function maskApiKey(rawKey: string): string {
  if (!rawKey) return "Not configured";
  if (rawKey.length <= 4) return "••••";
  return `••••••••${rawKey.slice(-4)}`;
}

function buildAiProviders(): AiProviderStatus[] {
  const available = ai.listAvailable();
  const availableIds = new Set<string>(available);

  return AI_PROVIDERS.map((info): AiProviderStatus => {
    const providerEnv = env.ai.providers[info.id as AiProviderId] as
      | { apiKey?: string; baseUrl?: string }
      | undefined;
    const apiKey = providerEnv?.apiKey ?? "";
    const baseUrl = providerEnv?.baseUrl ?? null;
    return {
      id: info.id,
      label: info.label,
      docsUrl: info.docsUrl,
      configured: availableIds.has(info.id) && Boolean(apiKey),
      baseUrl,
      keyPreview: maskApiKey(apiKey),
      isDefault: info.id === env.ai.defaultProvider,
    };
  });
}

function buildPaymentProviders(): PaymentProviderStatus[] {
  const available = billing.listAvailableProviders();
  const availableIds = new Set<string>(available);

  return PAYMENT_PROVIDERS.map((info): PaymentProviderStatus => {
    const id = info.id as PaymentProviderId;
    const secretConfigured = Boolean(
      id === "stripe"
        ? env.payments.stripe.secretKey
        : id === "paystack"
          ? env.payments.paystack.secretKey
          : env.payments.flutterwave.secretKey,
    );
    return {
      id,
      label: info.label,
      configured: availableIds.has(id) && secretConfigured,
      isDefault: id === env.payments.defaultProvider,
      supportedRegions: info.supportedRegions,
    };
  });
}

function buildSecret(value: string): SecretStatus {
  if (!value) {
    return { configured: false, maskedPreview: "Not configured" };
  }
  return {
    configured: true,
    maskedPreview: maskSecret(value, 4),
  };
}

const FOUNDATION_MODULES: readonly FoundationModule[] = [
  {
    id: "config",
    name: "Config validation",
    description: "Zod-validated, frozen `env` object — single source of truth for every env var.",
    path: "src/lib/config/env.ts",
    status: "ok",
  },
  {
    id: "errors",
    name: "Error hierarchy",
    description: "AppError base class + 11 domain errors with stable codes + serializable details.",
    path: "src/lib/errors/index.ts",
    status: "ok",
  },
  {
    id: "logger",
    name: "Structured logger",
    description: "Leveled, scoped, JSON-in-prod / pretty-in-dev logger with pluggable sinks.",
    path: "src/lib/logger/index.ts",
    status: "ok",
  },
  {
    id: "supabase",
    name: "Supabase clients",
    description: "Browser + server (RLS-enforced) + admin (service role) clients with typed Database.",
    path: "src/lib/supabase/",
    status: "ok",
  },
  {
    id: "ai",
    name: "AI provider layer",
    description: "7-provider registry + facade with streaming, tool calling, and usage recording.",
    path: "src/lib/ai/",
    status: "ok",
  },
  {
    id: "billing",
    name: "Billing layer",
    description: "Stripe + Paystack + Flutterwave providers with plan catalog and usage tracking.",
    path: "src/lib/billing/",
    status: "ok",
  },
  {
    id: "rateLimit",
    name: "Rate limiting",
    description: "Sliding-window counters with Redis backing + in-memory fallback. Fail-open on errors.",
    path: "src/lib/rate-limit/",
    status: "ok",
  },
  {
    id: "featureFlags",
    name: "Feature flags",
    description: "Two-tier evaluation — runtime overrides over env defaults. Pluggable KV store.",
    path: "src/lib/feature-flags/",
    status: "ok",
  },
  {
    id: "security",
    name: "Security / crypto",
    description: "AES-256-GCM encryption, HS256 JWT, peppered API-key hashing, sanitizers.",
    path: "src/lib/security/",
    status: "ok",
  },
  {
    id: "storage",
    name: "Storage service",
    description: "Typed StorageService over Supabase Storage with per-bucket validation + path builder.",
    path: "src/lib/storage/",
    status: "ok",
  },
  {
    id: "redis",
    name: "Redis / KV",
    description: "RedisStore (ioredis) + MemoryStore (in-process) with shared KVStore interface.",
    path: "src/lib/redis/",
    status: env.redis.enabled ? "ok" : "warning",
  },
  {
    id: "auth",
    name: "Auth & user management",
    description: "Supabase Auth + 7 data services + 16 API routes + RBAC (6 platform roles) + brute-force protection.",
    path: "src/lib/auth/",
    status: "ok",
  },
];

async function buildFoundationData(): Promise<FoundationData> {
  const featureFlags = await flagService.listFlags();

  return {
    appName: APP_NAME,
    appUrl: env.app.url,
    environment: env.app.environment,
    version: APP_VERSION,
    defaultAiProvider: env.ai.defaultProvider,
    defaultAiModel: env.ai.defaultModel,
    defaultPaymentProvider: env.payments.defaultProvider,
    defaultCurrency: env.payments.currency,
    redisEnabled: env.redis.enabled,
    supabaseConfigured: Boolean(env.supabase.url && env.supabase.anonKey),
    aiProviders: buildAiProviders(),
    paymentProviders: buildPaymentProviders(),
    plans: PLANS as readonly Plan[],
    rateLimitPresets: RATE_LIMIT_PRESETS,
    uploadMaxBytes: MAX_UPLOAD_SIZE_BYTES,
    uploadAllowedMimeTypes: ALLOWED_UPLOAD_MIME_TYPES,
    featureFlags,
    authSecret: buildSecret(env.security.authSecret),
    jwtSecret: buildSecret(env.security.jwtSecret),
    encryptionKey: buildSecret(env.security.encryptionKey),
    modules: FOUNDATION_MODULES,
  };
}

/**
 * Inspect the page's search params to detect an explicit auth intent.
 *
 *   - `?signin=1`     → user clicked "Sign in" → render the AuthFlow.
 *   - `?signup=1`     → user clicked "Get started" → render AuthFlow
 *                       (defaults to the register screen).
 *   - `?forgot=1`     → user clicked "Forgot password" → render AuthFlow
 *                       (forgot-password screen).
 *
 * Any of these opt the user out of the marketing surface for this request.
 */
function hasAuthIntent(searchParams: Record<string, string | string[] | undefined>): boolean {
  const truthy = (v: string | string[] | undefined): boolean => {
    if (v === undefined) return false;
    if (Array.isArray(v)) return v.some((x) => x === "1" || x === "true");
    return v === "1" || v === "true";
  };
  return (
    truthy(searchParams.signin) ||
    truthy(searchParams.signup) ||
    truthy(searchParams.forgot)
  );
}

export default async function HomePage({
  searchParams,
}: {
  // Next.js 15+ exposes `searchParams` as a Promise. Accept both the legacy
  // sync shape and the async Promise so this route is forward-compatible.
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}): Promise<React.ReactElement> {
  // Resolve searchParams (Next.js 15+ ships a Promise; older callers may
  // pass a plain object). The `await` is safe on both because awaiting a
  // non-thenable returns the value unchanged.
  const rawParams =
    typeof (searchParams as Promise<unknown> | undefined)?.then === "function"
      ? await (searchParams as Promise<Record<string, string | string[] | undefined>>)
      : (searchParams as Record<string, string | string[] | undefined> | undefined);

  let user: AuthUser | null = null;

  try {
    const ctx = await getSession();
    user = ctx?.user ?? null;
  } catch (err) {
    // Session resolution must NEVER break the page.
    logger.warn("page: session resolution failed; rendering logged-out view.", {
      error: String(err),
    });
    user = null;
  }

  // Always build the foundation snapshot — it's needed by both the auth
  // flow (for the Supabase-configured banner) and the dashboard shell.
  const foundationData = await buildFoundationData();

  // Unauthenticated branch:
  //   - If the URL carries an auth intent (?signin=1 / ?signup=1 / ?forgot=1),
  //     render the AuthFlow (login / register / forgot-password).
  //   - Otherwise, render the public marketing site.
  if (!user) {
    if (rawParams && hasAuthIntent(rawParams)) {
      return <AuthFlow supabaseConfigured={foundationData.supabaseConfigured} />;
    }
    return <MarketingSite />;
  }

  // Authenticated → assemble the user dashboard snapshot.
  let dashboardData: DashboardData | null = null;
  try {
    const profileService = await createProfileService();
    dashboardData = await profileService.getDashboardData(user.id);
  } catch (err) {
    // Dashboard-data assembly must NEVER block the page — the foundation
    // dashboard + foundation-only settings tabs stay usable without it.
    logger.warn("page: dashboard data assembly failed; falling back.", {
      error: String(err),
    });
    dashboardData = null;
  }

  return (
    <SectionRouter
      user={user}
      data={foundationData}
      dashboardData={dashboardData ?? undefined}
    />
  );
}
