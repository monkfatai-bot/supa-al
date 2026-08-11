import { createBrowserClient as createBrowserClientSSR } from "@supabase/ssr";
import { env } from "@/config/env";

// Comprehensive stub query builder
const createStubQueryBuilder = () => ({
  select: () => ({
    eq: () => ({ data: null, error: null }),
    in: () => ({ data: null, error: null }),
    order: () => ({ data: null, error: null }),
    limit: () => ({ data: null, error: null }),
    data: null,
    error: null,
  }),
  insert: () => ({ data: null, error: null }),
  update: () => ({ eq: () => ({ data: null, error: null }) }),
  delete: () => ({ eq: () => ({ data: null, error: null }) }),
  data: null,
  error: null,
});

// Stub client that implements the Supabase interface but does nothing
const STUB_CLIENT = {
  auth: {
    getUser: async () => ({ data: { user: null } }),
    onAuthStateChange: () => ({ 
      data: { subscription: { unsubscribe: () => {} } },
      subscription: { unsubscribe: () => {} }
    }),
    signOut: async () => ({ error: null }),
    signInWithOAuth: async () => ({ data: { url: "" }, error: null }),
  },
  channel: () => ({
    on: () => ({
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    subscribe: () => ({ unsubscribe: () => {} }),
    unsubscribe: () => Promise.resolve(),
  }),
  from: () => createStubQueryBuilder(),
  rpc: async () => ({ data: null, error: null }),
} as any;

export function createClient() {
  // If Supabase credentials are not configured, return stub client
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.debug("Supabase not configured - using stub client");
    return STUB_CLIENT;
  }

  try {
    return createBrowserClientSSR(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  } catch (error) {
    console.warn("Failed to create Supabase client:", error);
    return STUB_CLIENT;
  }
}
