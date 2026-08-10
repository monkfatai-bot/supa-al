import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

/**
 * Admin / service-role client.
 * Bypasses Row Level Security — use ONLY in server-side code.
 */
export function createAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
