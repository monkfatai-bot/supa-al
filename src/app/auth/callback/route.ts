import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env } from "@/config/env";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  console.log("🔐 Auth callback - code:", code ? "present" : "missing");

  if (error) {
    const message = errorDescription || error;
    console.error("❌ Auth error:", message);
    return NextResponse.redirect(new URL(`/auth/login?error=${error}`, origin));
  }

  if (!code) {
    console.error("❌ No code");
    return NextResponse.redirect(new URL("/auth/login", origin));
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("❌ Supabase not configured");
    return NextResponse.redirect(new URL("/auth/login", origin));
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
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
            });
          },
        },
      }
    );

    console.log("🔄 Exchanging code for session");
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !data.user) {
      console.error("❌ Session error");
      return NextResponse.redirect(new URL("/auth/login", origin));
    }

    console.log("✅ Session OK for user:", data.user.id);

    // Create the response with redirect
    const response = NextResponse.redirect(new URL("/chat", origin), {
      status: 302,
    });

    // Copy all auth-related cookies to response
    const authCookies = request.cookies.getAll().filter(cookie =>
      cookie.name.includes("sb-") || cookie.name.includes("auth")
    );
    
    console.log("📝 Setting cookies on response:", authCookies.map(c => c.name));
    
    authCookies.forEach(cookie => {
      response.cookies.set(cookie.name, cookie.value, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
        secure: true,
        httpOnly: true,
      });
    });

    // Also manually set the response to preserve the supabase cookies that were set
    const setCookieHeader = request.headers.get("set-cookie");
    if (setCookieHeader) {
      response.headers.append("set-cookie", setCookieHeader);
    }

    return response;
  } catch (error) {
    console.error("❌ Callback error:", error);
    return NextResponse.redirect(new URL("/auth/login", origin));
  }
}
