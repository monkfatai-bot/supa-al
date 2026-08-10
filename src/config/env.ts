import { z } from "zod";

/**
 * Environment configuration.
 *
 * Important: do not validate the entire process.env at module evaluation time.
 * Next.js/Vercel evaluates many route modules during build and page-data
 * collection. Optional integration credentials must not prevent an unrelated
 * page or route from building or starting.
 *
 * Feature-specific code should call one of the require* helpers below when it
 * actually needs credentials.
 */

const optionalString = z.string().min(1).optional();
const optionalUrl = z.string().url().optional();

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  GOOGLE_AI_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  QWEN_API_KEY: optionalString,
  GROK_API_KEY: optionalString,

  STABILITY_API_KEY: optionalString,
  REPLICATE_API_KEY: optionalString,
  IDEOGRAM_API_KEY: optionalString,
  FAL_API_KEY: optionalString,

  RUNWAY_API_KEY: optionalString,
  KLING_API_KEY: optionalString,
  LUMA_API_KEY: optionalString,
  PIKA_API_KEY: optionalString,

  ELEVENLABS_API_KEY: optionalString,
  DEEPGRAM_API_KEY: optionalString,
  AZURE_SPEECH_KEY: optionalString,
  AZURE_SPEECH_REGION: optionalString,
  ASSEMBLYAI_API_KEY: optionalString,
  CARTESIA_API_KEY: optionalString,
  PLAYHT_API_KEY: optionalString,
  PLAYHT_USER_ID: optionalString,

  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_APP_NAME: optionalString,

  ENCRYPTION_KEY: optionalString,

  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  PAYSTACK_SECRET_KEY: optionalString,
  FLUTTERWAVE_SECRET_KEY: optionalString,
  FLUTTERWAVE_WEBHOOK_SECRET: optionalString,

  GOOGLE_CALENDAR_CLIENT_ID: optionalString,
  GOOGLE_CALENDAR_CLIENT_SECRET: optionalString,
  OUTLOOK_CALENDAR_CLIENT_ID: optionalString,
  OUTLOOK_CALENDAR_CLIENT_SECRET: optionalString,

  GOOGLE_CLIENT_ID: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  MICROSOFT_CLIENT_ID: optionalString,
  APPLE_CLIENT_ID: optionalString,

  SLACK_BOT_TOKEN: optionalString,
  DISCORD_BOT_TOKEN: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_PHONE_ID: optionalString,
  GITHUB_TOKEN: optionalString,
});

export type Env = z.infer<typeof envSchema>;

function normalizeEnv(input: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === "string" && value.trim() === "" ? undefined : value,
    ])
  );
}

// Safe at module evaluation: empty optional values become undefined and no
// missing runtime credential can abort the Next.js build or route collection.
const normalized = normalizeEnv(process.env);

const parsed = envSchema.safeParse(normalized);

// Keep startup non-fatal. A malformed optional integration variable must not
// take down the entire application. Feature-specific requireEnv() calls below
// provide the actionable runtime validation when a credential is actually used.
export const env: Env = parsed.success ? parsed.data : (normalized as Env);

export type EnvKey = keyof Env;

export function requireEnv(...keys: EnvKey[]): Env {
  const missing = keys.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  return env;
}

export function requireSupabaseEnv(): Env {
  return requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export function requireSupabaseAdminEnv(): Env {
  return requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY"
  );
}

export function requireAnyAIProviderEnv(): Env {
  const providers: EnvKey[] = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_AI_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
    "QWEN_API_KEY",
    "GROK_API_KEY",
  ];

  if (!providers.some((key) => {
    const value = env[key];
    return typeof value === "string" && value.trim().length > 0;
  })) {
    throw new Error(
      `No AI provider is configured. Set at least one of: ${providers.join(", ")}`
    );
  }

  return env;
}

/** Validate selected environment variables without validating unrelated integrations. */
export function validateEnv(...keys: EnvKey[]): Env {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of keys) {
    shape[key] = envSchema.shape[key];
  }

  const result = z.object(shape).safeParse(env);
  if (!result.success) {
    const invalid = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean);
    throw new Error(`Invalid environment variables: ${invalid.join(", ")}`);
  }

  return env;
}
