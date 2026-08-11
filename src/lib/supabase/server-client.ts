import { createClient } from "@supabase/supabase-js";
import { createServerClient as createServerClientSSR, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/config/env";

// Comprehensive stub query builder that handles all chaining patterns
const createStubQueryBuilder = () => ({
  select: () => ({
    eq: () => ({ data: null, error: null }),
    in: () => ({ data: null, error: null }),
    neq: () => ({ data: null, error: null }),
    gt: () => ({ data: null, error: null }),
    gte: () => ({ data: null, error: null }),
    lt: () => ({ data: null, error: null }),
    lte: () => ({ data: null, error: null }),
    like: () => ({ data: null, error: null }),
    ilike: () => ({ data: null, error: null }),
    is: () => ({ data: null, error: null }),
    contains: () => ({ data: null, error: null }),
    range: () => ({ data: null, error: null }),
    order: () => ({
      data: null,
      error: null,
      eq: () => ({ data: null, error: null }),
      in: () => ({ data: null, error: null }),
    }),
    limit: () => ({ data: null, error: null }),
    data: null,
    error: null,
  }),
  insert: () => ({
    select: () => ({ data: null, error: null }),
    data: null,
    error: null,
  }),
  update: () => ({
    eq: () => ({ data: null, error: null }),
    select: () => ({ data: null, error: null }),
    data: null,
    error: null,
  }),
  delete: () => ({
    eq: () => ({ data: null, error: null }),
    select: () => ({ data: null, error: null }),
    data: null,
    error: null,
  }),
  data: null,
  error: null,
});

// Stub server client for when Supabase is not configured
const STUB_SERVER_CLIENT = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: null }),
    signInWithOAuth: async () => ({ data: { url: "" }, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: () => createStubQueryBuilder(),
  rpc: async () => ({ data: null, error: null }),
  channel: () => ({
    on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    subscribe: () => ({ unsubscribe: () => {} }),
  }),
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
