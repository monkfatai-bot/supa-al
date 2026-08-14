import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { ROUTES } from "@/config/constants";
import { env } from "@/config/env";

const AUTH_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.RESET_PASSWORD,
  ROUTES.VERIFY_EMAIL,
  ROUTES.AUTH_CALLBACK,
  "/auth/confirm", // Add confirm page to auth routes
];

const PROTECTED_ROUTES: string[] = [
  ROUTES.DASHBOARD,
  ROUTES.CHAT,
  ROUTES.CONTENT,
  ROUTES.IMAGE,
  ROUTES.VIDEO,
  ROUTES.VOICE,
  ROUTES.WORKSPACE,
  ROUTES.BUSINESS,
  ROUTES.AUTOMATION,
  ROUTES.EMPLOYEES,
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Skip if Supabase not configured
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log("⚠️  Supabase not configured, skipping auth");
    return response;
  }

  try {
    // Create Supabase client with response cookie handling
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            // Set cookies on response
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, {
                ...options,
                maxAge: 60 * 60 * 24 * 365,
                sameSite: "lax",
                secure: true,
                httpOnly: true,
              });
            });
          },
        },
      }
    );

    // Refresh user session (this is key - it verifies cookies and refreshes if needed)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    console.log(`📍 Middleware: ${pathname} - user = ${user ? user.id : "none"}`);

    // Authenticated user trying to access auth pages -> redirect to dashboard
    if (user && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
      console.log("✅ Authenticated user on auth page, redirecting to dashboard");
      return NextResponse.redirect(new URL(ROUTES.CHAT, request.url));
    }

    // Unauthenticated user trying to access protected routes -> redirect to login
    if (!user && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
      console.log("❌ Unauthenticated user trying to access protected route, redirecting to login");
      const loginUrl = new URL(ROUTES.LOGIN, request.url);
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  } catch (error) {
    console.error("⚠️  Middleware error:", error);
    // Continue without auth if there's an error
    return response;
  }
}
