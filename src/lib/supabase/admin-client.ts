import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

// Stub admin client for when Supabase is not configured
const STUB_ADMIN_CLIENT = {
  auth: {
    admin: {
      createUser: async () => ({ data: { user: null }, error: null }),
      deleteUser: async () => ({ data: null, error: null }),
    },
  },
  from: () => ({
    select: () => ({ eq: () => ({ in: () => ({ data: [], error: null }) }), data: [], error: null }),
    insert: () => ({ data: null, error: null }),
    update: () => ({ eq: () => ({ data: null, error: null }), data: null, error: null }),
    delete: () => ({ eq: () => ({ data: null, error: null }), data: null, error: null }),
  }),
  rpc: async () => ({ data: null, error: null }),
} as any;

/**
 * Admin / service-role client.
 * Bypasses Row Level Security — use ONLY in server-side code.
 */
export function createAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Supabase admin credentials not configured - using stub");
    return STUB_ADMIN_CLIENT;
  }

  try {
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } catch (error) {
    console.warn("Failed to create admin client:", error);
    return STUB_ADMIN_CLIENT;
  }
}
