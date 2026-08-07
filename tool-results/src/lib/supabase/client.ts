/**
 * Supa AI — Browser Supabase client.
 *
 * Lazy, singleton-scoped client for use in Client Components and browser
 * hooks. Uses `createBrowserClient` from `@supabase/ssr`, which reads + writes
 * `sb-`-prefixed auth cookies via the standard browser cookie jar so sessions
 * survive across SSR roundtrips without any custom wiring.
 *
 * Always reads the **anon** key — never the service role key. RLS is
 * therefore enforced on every query.
 *
 * @module @/lib/supabase/client
 */
import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/config/env";
import type { Database } from "@/lib/supabase/types";

/** Concrete browser Supabase client type (typed against our Database). */
export type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let _client: BrowserSupabaseClient | null = null;

/**
 * Build a fresh, isolated browser Supabase client. Use this in tests or when
 * you explicitly need a separate auth context. For app code prefer the
 * {@link supabaseBrowser} singleton so duplicate Auth instances aren't
 * created.
 */
export function createSupabaseBrowserClient(): BrowserSupabaseClient {
  return createBrowserClient<Database>(env.supabase.url, env.supabase.anonKey);
}

/**
 * Module-level singleton browser client.
 *
 * Implemented as a `Proxy` so that:
 *   1. Importing this module from a Server Component is safe (no client is
 *      allocated at import time).
 *   2. The first property access in a browser lazily constructs the client.
 *   3. Server-side access throws a clear, actionable error rather than
 *      silently returning a broken client.
 *
 * Usage in Client Components:
 *
 * ```ts
 * import { supabaseBrowser } from "@/lib/supabase/client";
 * const { data } = await supabaseBrowser.from("ai_conversations").select();
 * ```
 */
export const supabaseBrowser = new Proxy(
  {} as BrowserSupabaseClient,
  {
    get(_target, prop) {
      if (typeof window === "undefined") {
        throw new Error(
          "supabaseBrowser may only be accessed from browser code. " +
            "Use createSupabaseServerClient() in Server Components / routes.",
        );
      }
      if (_client === null) {
        _client = createSupabaseBrowserClient();
      }
      const value = Reflect.get(_client, prop, _client);
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(_client);
      }
      return value;
    },
  },
) as BrowserSupabaseClient;
