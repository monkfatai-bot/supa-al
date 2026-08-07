/**
 * Supa AI — Edge middleware.
 *
 * Refreshes the Supabase auth session cookie on every navigation request so
 * SSR/RSC can read the freshest session without an explicit client-side
 * refresh. We never redirect — there's only one user-visible route (`/`),
 * so any auth state (logged-in, logged-out, expired) is handled by the
 * page itself.
 *
 * Wrap everything in try/catch: an auth-refresh failure must never break
 * the page. On error we pass through so the page renders with whatever
 * cookies exist (and the server component resolves "no session").
 *
 * The matcher excludes static assets, image files, and Next internals so
 * we don't pay the cookie round-trip for them.
 *
 * @module @/middleware
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";

async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      env.supabase.url,
      env.supabase.anonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Apply to both the incoming request and the outgoing response
              // so downstream handlers see the refreshed cookie.
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    // `getUser()` is the call that triggers a session refresh when the
    // access token is close to expiry. We don't actually need the user
    // object here — we just want the side effect of refreshing cookies.
    await supabase.auth.getUser();
  } catch (err) {
    // Never let an auth-refresh failure break the page — pass through.
    logger.warn("middleware: session refresh failed; passing through.", {
      error: String(err),
      path: request.nextUrl.pathname,
    });
  }

  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
