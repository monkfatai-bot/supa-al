import { createClient } from "@supabase/supabase-js";
import { createServerClient as createServerClientSSR, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/config/env";

// Stub server client for when Supabase is not configured
const STUB_SERVER_CLIENT = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: null }),
  },
  from: () => ({
    select: () => ({ eq: () => ({ in: () => ({ data: [], error: null }) }), data: [], error: null }),
    insert: () => ({ data: null, error: null }),
    update: () => ({ eq: () => ({ data: null, error: null }), data: null, error: null }),
    delete: () => ({ eq: () => ({ data: null, error: null }), data: null, error: null }),
  }),
  rpc: async () => ({ data: null, error: null }),
} as any;

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("Supabase not configured - using stub server client");
    return STUB_SERVER_CLIENT;
  }

  try {
    return createServerClientSSR(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options as CookieOptions)
              );
            } catch {
              // Ignore cookie errors in server components
            }
          },
        },
      }
    );
  } catch (error) {
    console.warn("Failed to create server Supabase client:", error);
    return STUB_SERVER_CLIENT;
  }
}

/**
 * Service-role client that bypasses Row Level Security.
 * Use for internal / background operations where user context
 * is verified beforehand via requireAuth().
 */
export function createServiceClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Supabase service role key not configured - using stub");
    return STUB_SERVER_CLIENT;
  }

  try {
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } catch (error) {
    console.warn("Failed to create service client:", error);
    return STUB_SERVER_CLIENT;
  }
}
