import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { ROUTES } from "@/config/constants";
import { env } from "@/config/env";

/**
 * Routes that should only be accessible by unauthenticated users.
 * Authenticated users visiting these routes are redirected to HOME.
 */
const AUTH_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.RESET_PASSWORD,
  ROUTES.VERIFY_EMAIL,
];

/**
 * Routes that require authentication.
 * Unauthenticated users are redirected to LOGIN.
 */
const PROTECTED_ROUTES: string[] = [ROUTES.DASHBOARD, ROUTES.CHAT, ROUTES.CONTENT, ROUTES.IMAGE, ROUTES.VIDEO, ROUTES.VOICE, ROUTES.WORKSPACE, ROUTES.BUSINESS, ROUTES.AUTOMATION, ROUTES.EMPLOYEES];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If Supabase credentials are not configured, skip authentication
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: { name: string; value: string; options?: CookieOptions }[]
          ) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options as CookieOptions)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    // Authenticated user trying to access auth pages -> redirect home
    if (user && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL(ROUTES.HOME, request.url));
    }

    // Unauthenticated user trying to access protected routes -> redirect login
    if (!user && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
      const url = request.nextUrl.clone();
      url.pathname = ROUTES.LOGIN;
      url.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(url);
    }
  } catch (error) {
    // If Supabase authentication fails, continue without auth
    console.warn("Supabase authentication unavailable:", error);
  }

  return supabaseResponse;
}
