/**
 * Supa AI — Supabase client barrel.
 *
 * Single import surface for the three Supabase client factories and the
 * database type map:
 *
 *   - {@link createSupabaseBrowserClient} / {@link supabaseBrowser}  (browser, RLS)
 *   - {@link createSupabaseServerClient}                              (RSC/routes, RLS)
 *   - {@link createSupabaseAdminClient}                               (server-only, bypasses RLS)
 *
 * @module @/lib/supabase
 */
export {
  createSupabaseBrowserClient,
  supabaseBrowser,
  type BrowserSupabaseClient,
} from "@/lib/supabase/client";

export {
  createSupabaseServerClient,
  type ServerSupabaseClient,
} from "@/lib/supabase/server";

export {
  createSupabaseAdminClient,
  type AdminSupabaseClient,
} from "@/lib/supabase/admin";

export {
  type Database,
  type Tables,
  type TablesInsert,
  type TablesUpdate,
} from "@/lib/supabase/types";
