import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { ensureProfile } from "@/services/auth/session";
import { env } from "@/config/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  console.log("🔐 Auth callback received", {
    code: code ? "present" : "missing",
    error,
    origin,
  });

  // If Supabase returned an error, redirect to login with error
  if (error) {
    const message = errorDescription || error;
    console.error("❌ Supabase auth error:", message);
    const url = new URL(`${origin}/auth/login`);
    url.searchParams.set("error", error);
    url.searchParams.set("message", message);
    return NextResponse.redirect(url);
  }

  // If Supabase is not configured, show setup error
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("❌ Supabase credentials not configured");
    const url = new URL(`${origin}/auth/login`);
    url.searchParams.set("error", "supabase_not_configured");
    url.searchParams.set("message", "Supabase is not configured");
    return NextResponse.redirect(url);
  }

  // Must have a code to proceed
  if (!code) {
    console.error("❌ No authorization code in callback");
    const url = new URL(`${origin}/auth/login`);
    url.searchParams.set("error", "no_code");
    return NextResponse.redirect(url);
  }

  try {
    // Create a response we'll modify to add cookies
    const dashboardUrl = new URL(`${origin}/chat`);
    let response = NextResponse.redirect(dashboardUrl, { status: 302 });

    // Create Supabase client with cookie handling
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll().map(cookie => ({
              name: cookie.name,
              value: cookie.value,
            }));
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            console.log("📝 Setting cookies:", cookiesToSet.map(c => c.name).join(", "));
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options as CookieOptions);
            });
          },
        },
      }
    );

    console.log("🔄 Exchanging authorization code for session...");
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      console.error("❌ Session exchange failed:", sessionError.message);
      const url = new URL(`${origin}/auth/login`);
      url.searchParams.set("error", "session_failed");
      url.searchParams.set("message", sessionError.message);
      return NextResponse.redirect(url);
    }

    if (!data.user) {
      console.error("❌ No user returned from session exchange");
      const url = new URL(`${origin}/auth/login`);
      url.searchParams.set("error", "no_user");
      return NextResponse.redirect(url);
    }

    console.log("✅ Session exchanged successfully", {
      userId: data.user.id,
      email: data.user.email,
    });

    // Ensure profile exists (non-blocking)
    try {
      await ensureProfile(data.user.id);
      console.log("✅ Profile ensured for user:", data.user.id);
    } catch (profileError) {
      console.warn("⚠️ Profile creation failed (non-blocking):", profileError);
    }

    console.log("🚀 Redirecting to dashboard with session cookies");
    return response;
  } catch (error) {
    console.error("❌ Unexpected error in auth callback:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const url = new URL(`${origin}/auth/login`);
    url.searchParams.set("error", "exception");
    url.searchParams.set("message", message);
    return NextResponse.redirect(url);
  }
}
