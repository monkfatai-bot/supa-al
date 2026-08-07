/**
 * Supa AI — Admin / service-role Supabase client.
 *
 * ⚠️ ⚠️ ⚠️  DANGER ZONE  ⚠️ ⚠️ ⚠️
 *
 * Service-role client — NEVER import in client code or expose to the browser.
 * Server-only. This client bypasses Row-Level Security entirely and can read,
 * mutate, or delete any row in any table. Use it exclusively for:
 *
 *   - Background jobs / webhooks that need to act on behalf of the system.
 *   - System-level maintenance (creating orgs, syncing subscriptions).
 *   - Reading data not owned by any user (e.g. billing reconciliation).
 *
 * Never log the service role key. Never return raw rows from admin queries to
 * the client without an explicit allowlist filter.
 *
 * @module @/lib/supabase/admin
 */
import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/config/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Concrete admin Supabase client type — inferred from `@supabase/supabase-js`'s
 * `createClient<Database>` return signature so we never drift from the SDK's
 * own generic defaults.
 */
export type AdminSupabaseClient = Awaited<
  ReturnType<typeof createClient<Database>>
>;

let _adminClient: AdminSupabaseClient | null = null;

/**
 * Create the service-role Supabase client. The client is a process-level
 * singleton (sessions are explicitly disabled, so there is no per-request
 * state). Repeated calls return the cached instance.
 *
 * @returns {AdminSupabaseClient} A Supabase client configured with the
 *   service role key and no session persistence.
 */
export function createSupabaseAdminClient(): AdminSupabaseClient {
  if (_adminClient !== null) {
    return _adminClient;
  }

  const client = createClient<Database>(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  _adminClient = client;
  return _adminClient;
}
