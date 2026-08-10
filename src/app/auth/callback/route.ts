import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { ensureProfile } from "@/services/auth/session";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Ensure profile exists (handles social login signups)
      await ensureProfile(data.user.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect to login on error or missing code
  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
}
