import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { ensureProfile } from "@/services/auth/session";
import { env } from "@/config/env";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  console.log("🔐 Auth callback - code:", code ? "present" : "missing", "error:", error);

  // If Supabase returned an error
  if (error) {
    const message = errorDescription || error;
    console.error("❌ Auth error:", message);
    return NextResponse.redirect(new URL(`/auth/login?error=${error}&message=${encodeURIComponent(message)}`, origin));
  }

  // No code
  if (!code) {
    console.error("❌ No code");
    return NextResponse.redirect(new URL("/auth/login?error=no_code", origin));
  }

  // Check config
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("❌ Supabase not configured");
    return NextResponse.redirect(new URL("/auth/login?error=config", origin));
  }

  try {
    // Create response first
    const response = NextResponse.redirect(new URL("/chat", origin), {
      status: 302,
    });

    // Create Supabase client with response cookie handling
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            console.log("📝 Setting cookies on response");
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, {
                ...options,
                sameSite: "lax",
                secure: true,
              });
            });
          },
        },
      }
    );

    // Exchange code for session
    console.log("🔄 Exchanging code for session");
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      console.error("❌ Session error:", sessionError.message);
      return NextResponse.redirect(new URL(`/auth/login?error=session&message=${encodeURIComponent(sessionError.message)}`, origin));
    }

    if (!data.user) {
      console.error("❌ No user");
      return NextResponse.redirect(new URL("/auth/login?error=no_user", origin));
    }

    console.log("✅ Session OK for user:", data.user.id);

    // Ensure profile exists
    try {
      await ensureProfile(data.user.id);
      console.log("✅ Profile OK");
    } catch (e) {
      console.warn("⚠️ Profile error:", e);
    }

    console.log("🚀 Redirecting to /chat with cookies set");
    return response;
  } catch (error) {
    console.error("❌ Callback error:", error);
    const message = error instanceof Error ? error.message : "Unknown";
    return NextResponse.redirect(new URL(`/auth/login?error=exception&message=${encodeURIComponent(message)}`, origin));
  }
}
