import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/config/env";

/**
 * Auth callback route - handles Supabase email confirmation redirect
 * 
 * Flow:
 * 1. Supabase sends user here with ?code=XXX
 * 2. We exchange code for session
 * 3. Supabase sets session cookies via createServerClient
 * 4. We redirect to /auth/confirm (confirmation page)
 * 5. Confirmation page verifies session is set, then redirects to /chat
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  console.log("📍 Callback: code present =", !!code, "error =", error);

  // Handle Supabase errors
  if (error) {
    const msg = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(`${origin}/auth/login?error=${error}&message=${msg}`);
  }

  // No code provided
  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
  }

  // Supabase not configured
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("❌ Supabase not configured");
    return NextResponse.redirect(`${origin}/auth/login?error=config`);
  }

  try {
    // Create response first (this is crucial for cookie handling)
    let response = NextResponse.redirect(`${origin}/auth/confirm`, { status: 302 });

    // Create Supabase client that will set cookies on response
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: any[]) {
            // CRITICAL: Set cookies on the response object
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, {
                ...options,
                maxAge: 60 * 60 * 24 * 365, // 1 year
                sameSite: "lax",
                secure: true,
                httpOnly: true,
              });
            });
          },
        },
      }
    );

    // Exchange code for session - this triggers the setAll callback above
    console.log("🔄 Exchanging code for session...");
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      console.error("❌ Session exchange failed:", sessionError.message);
      return NextResponse.redirect(`${origin}/auth/login?error=session`);
    }

    if (!data.user) {
      console.error("❌ No user in session data");
      return NextResponse.redirect(`${origin}/auth/login?error=no_user`);
    }

    console.log("✅ Session exchanged, user:", data.user.id);
    console.log("🚀 Redirecting to /auth/confirm");

    // Return response WITH cookies set
    return response;
  } catch (error) {
    console.error("❌ Callback exception:", error);
    return NextResponse.redirect(`${origin}/auth/login?error=exception`);
  }
}
