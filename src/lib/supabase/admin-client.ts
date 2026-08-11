import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

// Comprehensive stub query builder
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

// Stub admin client for when Supabase is not configured
const STUB_ADMIN_CLIENT = {
  auth: {
    admin: {
      createUser: async () => ({ data: { user: null }, error: null }),
      deleteUser: async () => ({ data: null, error: null }),
    },
  },
  from: () => createStubQueryBuilder(),
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
