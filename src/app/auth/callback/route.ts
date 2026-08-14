import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
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
    const supabase = await createServerSupabaseClient();

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

    // Redirect to chat dashboard with a proper redirect
    const dashboardUrl = new URL(`${origin}/chat`);
    console.log("🚀 Redirecting to dashboard:", dashboardUrl.toString());
    
    const response = NextResponse.redirect(dashboardUrl, {
      status: 302,
    });

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
