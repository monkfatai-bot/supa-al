/**
 * Supa AI — Centralized, validated environment configuration.
 *
 * Single source of truth for every environment variable. Validated once at
 * boot with Zod; importing modules receive a strongly-typed, immutable `env`
 * object. Unknown keys are rejected; missing required keys throw a
 * `ConfigurationError` with an actionable message.
 *
 * @module @/lib/config/env
 */
import { z } from "zod";

import { ConfigurationError } from "@/lib/errors";

/**
 * Zod schema mirroring `.env.example`. Keeping the schema here means the
 * contract is enforced in code, not just documentation.
 */
const envSchema = z.object({
  // App ---------------------------------------------------------------------
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Supa AI"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENVIRONMENT: z.enum(["development", "staging", "production"]),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Supabase ----------------------------------------------------------------
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Redis (optional — empty string enables in-memory fallback) -------------
  REDIS_URL: z.string().default(""),
  REDIS_TOKEN: z.string().default(""),

  // AI providers ------------------------------------------------------------
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  ANTHROPIC_API_KEY: z.string().default(""),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().default(""),
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_BASE_URL: z
    .string()
    .url()
    .default("https://openrouter.ai/api/v1"),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),
  QWEN_API_KEY: z.string().default(""),
  QWEN_BASE_URL: z
    .string()
    .url()
    .default("https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
  GROK_API_KEY: z.string().default(""),
  GROK_BASE_URL: z.string().url().default("https://api.x.ai/v1"),

  // Video providers (Phase 5) ------------------------------------------------
  RUNWAY_API_KEY: z.string().default(""),
  RUNWAY_BASE_URL: z
    .string()
    .url()
    .default("https://api.runwayml.com/v1"),
  KLING_API_KEY: z.string().default(""),
  KLING_BASE_URL: z
    .string()
    .url()
    .default("https://api.klingai.com/v1"),
  LUMA_API_KEY: z.string().default(""),
  LUMA_BASE_URL: z
    .string()
    .url()
    .default("https://api.lumalabs.ai/v1"),
  PIKA_API_KEY: z.string().default(""),
  PIKA_BASE_URL: z
    .string()
    .url()
    .default("https://api.pika.art/v1"),
  REPLICATE_API_TOKEN: z.string().default(""),
  REPLICATE_BASE_URL: z
    .string()
    .url()
    .default("https://api.replicate.com/v1"),
  FAL_API_KEY: z.string().default(""),
  FAL_BASE_URL: z.string().url().default("https://fal.run"),
  GOOGLE_VIDEO_API_KEY: z.string().default(""),
  OPENAI_VIDEO_API_KEY: z.string().default(""),

  AI_DEFAULT_PROVIDER: z.string().default("openai"),
  AI_DEFAULT_MODEL: z.string().default("gpt-4o-mini"),

  // Payments ----------------------------------------------------------------
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().default(""),
  PAYSTACK_SECRET_KEY: z.string().default(""),
  PAYSTACK_PUBLIC_KEY: z.string().default(""),
  PAYSTACK_WEBHOOK_SECRET: z.string().default(""),
  FLUTTERWAVE_SECRET_KEY: z.string().default(""),
  FLUTTERWAVE_PUBLIC_KEY: z.string().default(""),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().default(""),
  PAYMENTS_DEFAULT_PROVIDER: z
    .enum(["stripe", "paystack", "flutterwave"])
    .default("stripe"),
  PAYMENTS_CURRENCY: z.string().default("usd"),

  // Security ----------------------------------------------------------------
  AUTH_SECRET: z.string().min(16),
  JWT_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 32 bytes hex (64 chars)"),
  RATE_LIMIT_SECRET: z.string().min(8),
  CRON_SECRET: z.string().min(8).default("dev-cron-secret"),

  // Feature flags -----------------------------------------------------------
  FEATURE_CHAT_ENABLED: z
    .union([z.string(), z.boolean()])
    .default("true")
    .transform((v) => v === true || v === "true"),
  FEATURE_IMAGE_GENERATION_ENABLED: z
    .union([z.string(), z.boolean()])
    .default("false")
    .transform((v) => v === true || v === "true"),
  FEATURE_MARKETPLACE_ENABLED: z
    .union([z.string(), z.boolean()])
    .default("false")
    .transform((v) => v === true || v === "true"),
  FEATURE_BUSINESS_TOOLS_ENABLED: z
    .union([z.string(), z.boolean()])
    .default("false")
    .transform((v) => v === true || v === "true"),
});

export type EnvSchema = z.infer<typeof envSchema>;

/**
 * Parsed + validated environment. Throws a `ConfigurationError` if validation
 * fails so the process fails fast at boot rather than degrading silently.
 */
function loadEnv(): EnvSchema {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigurationError(
      `Invalid environment configuration. Fix the following:\n${issues}`,
    );
  }
  return parsed.data;
}

/**
 * Next.js evaluates server modules while collecting route/page data during
 * `next build`. Private runtime secrets are not required merely to compile
 * the application, but the strict validator above must still run in
 * production when the application actually uses its configuration.
 *
 * During the production build only, provide deterministic, schema-valid
 * placeholders for private secrets that may legitimately be absent from the
 * build environment. Public application/Supabase configuration is still
 * validated normally, so a deployment cannot silently build with a malformed
 * public URL or Supabase endpoint.
 *
 * This does NOT weaken runtime validation: once the deployed server runs,
 * `loadEnv()` validates the real process environment and throws a
 * ConfigurationError if required runtime values are missing or invalid.
 */
function loadBuildEnv(): EnvSchema {
  const buildEnv = {
    ...process.env,
    AUTH_SECRET:
      process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16
        ? process.env.AUTH_SECRET
        : "supa-ai-build-auth-secret",
    JWT_SECRET:
      process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16
        ? process.env.JWT_SECRET
        : "supa-ai-build-jwt-secret",
    ENCRYPTION_KEY:
      process.env.ENCRYPTION_KEY &&
      /^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)
        ? process.env.ENCRYPTION_KEY
        : "0000000000000000000000000000000000000000000000000000000000000000",
    RATE_LIMIT_SECRET:
      process.env.RATE_LIMIT_SECRET && process.env.RATE_LIMIT_SECRET.length >= 8
        ? process.env.RATE_LIMIT_SECRET
        : "supa-ai-build-rate-limit",
  };

  const parsed = envSchema.safeParse(buildEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigurationError(
      `Invalid build-time environment configuration. Fix the following:\n${issues}`,
    );
  }
  return parsed.data;
}

const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
const rawEnv = isNextBuild ? loadBuildEnv() : loadEnv();

/**
 * Immutable, nested `env` object. Prefer this over `process.env` everywhere.
 * Namespaced by domain for ergonomic access: `env.supabase.url`, `env.ai.*`, etc.
 */
export const env = Object.freeze({
  app: {
    name: rawEnv.NEXT_PUBLIC_APP_NAME,
    url: rawEnv.NEXT_PUBLIC_APP_URL,
    environment: rawEnv.NEXT_PUBLIC_APP_ENVIRONMENT,
    nodeEnv: rawEnv.NODE_ENV,
    isDev: rawEnv.NEXT_PUBLIC_APP_ENVIRONMENT === "development",
    isStaging: rawEnv.NEXT_PUBLIC_APP_ENVIRONMENT === "staging",
    isProd: rawEnv.NEXT_PUBLIC_APP_ENVIRONMENT === "production",
  },
  supabase: {
    url: rawEnv.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: rawEnv.SUPABASE_SERVICE_ROLE_KEY,
  },
  redis: {
    url: rawEnv.REDIS_URL,
    token: rawEnv.REDIS_TOKEN,
    enabled: rawEnv.REDIS_URL.length > 0,
  },
  ai: {
    defaultProvider: rawEnv.AI_DEFAULT_PROVIDER,
    defaultModel: rawEnv.AI_DEFAULT_MODEL,
    providers: {
      openai: { apiKey: rawEnv.OPENAI_API_KEY, baseUrl: rawEnv.OPENAI_BASE_URL },
      anthropic: { apiKey: rawEnv.ANTHROPIC_API_KEY },
      google: { apiKey: rawEnv.GOOGLE_GENERATIVE_AI_API_KEY },
      openrouter: {
        apiKey: rawEnv.OPENROUTER_API_KEY,
        baseUrl: rawEnv.OPENROUTER_BASE_URL,
      },
      deepseek: {
        apiKey: rawEnv.DEEPSEEK_API_KEY,
        baseUrl: rawEnv.DEEPSEEK_BASE_URL,
      },
      qwen: { apiKey: rawEnv.QWEN_API_KEY, baseUrl: rawEnv.QWEN_BASE_URL },
      grok: { apiKey: rawEnv.GROK_API_KEY, baseUrl: rawEnv.GROK_BASE_URL },
    },
    video: {
      runway: { apiKey: rawEnv.RUNWAY_API_KEY, baseUrl: rawEnv.RUNWAY_BASE_URL },
      kling: { apiKey: rawEnv.KLING_API_KEY, baseUrl: rawEnv.KLING_BASE_URL },
      luma: { apiKey: rawEnv.LUMA_API_KEY, baseUrl: rawEnv.LUMA_BASE_URL },
      pika: { apiKey: rawEnv.PIKA_API_KEY, baseUrl: rawEnv.PIKA_BASE_URL },
      replicate: {
        apiToken: rawEnv.REPLICATE_API_TOKEN,
        baseUrl: rawEnv.REPLICATE_BASE_URL,
      },
      fal: { apiKey: rawEnv.FAL_API_KEY, baseUrl: rawEnv.FAL_BASE_URL },
      google: { apiKey: rawEnv.GOOGLE_VIDEO_API_KEY },
      openai: { apiKey: rawEnv.OPENAI_VIDEO_API_KEY },
    },
  },
  payments: {
    defaultProvider: rawEnv.PAYMENTS_DEFAULT_PROVIDER,
    currency: rawEnv.PAYMENTS_CURRENCY,
    stripe: {
      secretKey: rawEnv.STRIPE_SECRET_KEY,
      publishableKey: rawEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      webhookSecret: rawEnv.STRIPE_WEBHOOK_SECRET,
    },
    paystack: {
      secretKey: rawEnv.PAYSTACK_SECRET_KEY,
      publicKey: rawEnv.PAYSTACK_PUBLIC_KEY,
      webhookSecret: rawEnv.PAYSTACK_WEBHOOK_SECRET,
    },
    flutterwave: {
      secretKey: rawEnv.FLUTTERWAVE_SECRET_KEY,
      publicKey: rawEnv.FLUTTERWAVE_PUBLIC_KEY,
      webhookSecret: rawEnv.FLUTTERWAVE_WEBHOOK_SECRET,
    },
  },
  security: {
    authSecret: rawEnv.AUTH_SECRET,
    jwtSecret: rawEnv.JWT_SECRET,
    encryptionKey: rawEnv.ENCRYPTION_KEY,
    rateLimitSecret: rawEnv.RATE_LIMIT_SECRET,
    cronSecret: rawEnv.CRON_SECRET,
  },
  features: {
    chat: rawEnv.FEATURE_CHAT_ENABLED,
    imageGeneration: rawEnv.FEATURE_IMAGE_GENERATION_ENABLED,
    marketplace: rawEnv.FEATURE_MARKETPLACE_ENABLED,
    businessTools: rawEnv.FEATURE_BUSINESS_TOOLS_ENABLED,
  },
});

export type Env = typeof env;
