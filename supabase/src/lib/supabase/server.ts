/**
 * Supa AI — Server Supabase client (App Router).
 *
 * Builds a per-request Supabase client wired into Next.js's `cookies()` API.
 * Reads + writes the `sb-`-prefixed auth cookies so SSR/RSC can hydrate the
 * user's session. Uses the **anon** key — never the service role key — so
 * Row-Level Security is enforced on every query, exactly as it is in the
 * browser.
 *
 * This module is server-only: importing it from a Client Component throws at
 * build time.
 *
 * @module @/lib/supabase/server
 */
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/config/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Concrete server Supabase client type — inferred from `@supabase/ssr`'s
 * `createServerClient<Database>` return signature so we never drift from the
 * SDK's own generic defaults.
 */
export type ServerSupabaseClient = Awaited<
  ReturnType<typeof createServerClient<Database>>
>;

/**
 * Create a per-request Supabase client for use in Server Components, Route
 * Handlers, and Server Actions. Must be awaited because `next/headers`'s
 * `cookies()` is async in Next.js 15+.
 *
 * @example
 * ```ts
 * import { createSupabaseServerClient } from "@/lib/supabase/server";
 * const supabase = await createSupabaseServerClient();
 * const { data } = await supabase.from("users").select();
 * ```
 */
export async function createSupabaseServerClient(): Promise<ServerSupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method is called from a Server Component where
          // cookies cannot be set (the response is already streaming). This
          // is fine as long as a middleware refreshes the session cookie —
          // the new tokens will land on the next request.
        }
      },
    },
  });
}
