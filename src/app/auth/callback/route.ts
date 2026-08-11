import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { ensureProfile } from "@/services/auth/session";
import { env } from "@/config/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Default to dashboard after login, allow override with 'next' param
  const next = searchParams.get("next") ?? "/chat";

  // If Supabase is not configured, redirect to setup page
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(
      `${origin}/setup?error=supabase_not_configured&message=Please%20configure%20Supabase%20to%20use%20authentication`
    );
  }

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.user) {
        // Ensure profile exists (handles social login signups)
        await ensureProfile(data.user.id);
        // Redirect to dashboard or requested page
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch (error) {
      console.error("Auth callback error:", error);
    }
  }

  // Redirect to login on error or missing code
  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
}
