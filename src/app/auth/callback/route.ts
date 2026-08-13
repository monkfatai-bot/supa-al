import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { ensureProfile } from "@/services/auth/session";
import { env } from "@/config/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/chat";

  console.log("Auth callback called:", {
    code: code ? "present" : "missing",
    error,
    errorDescription,
    origin,
  });

  // If Supabase returned an error, show it
  if (error) {
    const message = errorDescription || error;
    console.error("Supabase auth error:", message);
    return NextResponse.redirect(`${origin}/auth/login?error=${error}&message=${encodeURIComponent(message)}`);
  }

  // If Supabase is not configured, redirect to setup page
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("Supabase not configured");
    return NextResponse.redirect(
      `${origin}/setup?error=supabase_not_configured&message=Please%20configure%20Supabase%20to%20use%20authentication`
    );
  }

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

      if (sessionError) {
        console.error("Session exchange error:", sessionError);
        return NextResponse.redirect(`${origin}/auth/login?error=session_failed&message=${encodeURIComponent(sessionError.message)}`);
      }

      if (!data.user) {
        console.error("No user returned from session exchange");
        return NextResponse.redirect(`${origin}/auth/login?error=no_user`);
      }

      console.log("Session exchanged successfully", { userId: data.user.id });

      // Ensure profile exists (handles social login signups)
      await ensureProfile(data.user.id);

      // Redirect to dashboard or requested page
      console.log("Redirecting to", next);
      return NextResponse.redirect(`${origin}${next}`);
    } catch (error) {
      console.error("Auth callback exception:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.redirect(`${origin}/auth/login?error=exception&message=${encodeURIComponent(errorMsg)}`);
    }
  }

  console.error("No code provided to callback");
  // Redirect to login on error or missing code
  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed&message=No%20authorization%20code`);
}
