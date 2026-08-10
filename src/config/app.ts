import { env } from "./env";

export const APP_CONFIG = {
  name: env.NEXT_PUBLIC_APP_NAME,
  url: env.NEXT_PUBLIC_APP_URL,
  description: "AI-powered platform built on Supabase",
  version: "0.1.0",
} as const;

export type AppConfig = typeof APP_CONFIG;
