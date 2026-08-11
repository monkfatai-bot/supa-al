import { createBrowserClient as createBrowserClientSSR } from "@supabase/ssr";
import { env } from "@/config/env";

// Stub client that implements the Supabase interface but does nothing
const STUB_CLIENT = {
  auth: {
    getUser: async () => ({ data: { user: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  channel: () => ({
    on: () => ({ subscribe: () => ({ unsubscribe: () => {} }), subscribe: () => ({ unsubscribe: () => {} }) }),
    subscribe: () => ({ unsubscribe: () => {} }),
  }),
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
