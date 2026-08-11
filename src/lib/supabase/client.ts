import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/config/env";

export function createClient() {
  // If Supabase credentials are not configured, return null
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("Supabase credentials not configured - authentication disabled");
    return null;
  }

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
