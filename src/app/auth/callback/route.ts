import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { ensureProfile } from "@/services/auth/session";
import { env } from "@/config/env";
import { ROUTES } from "@/config/constants";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Accept several common param names used by different flows/SDKs
  const nextParamRaw =
    searchParams.get("next") ??
    searchParams.get("redirectTo") ??
    searchParams.get("redirect_to") ??
    searchParams.get("redirect") ??
    ROUTES.DASHBOARD; // fallback to dashboard

  // Normalize to a path. If a full URL was provided, extract pathname.
  let next: string;
  try {
    if (/^https?:\/\//i.test(nextParamRaw)) {
      next = new URL(nextParamRaw).pathname;
    } else {
      next = nextParamRaw.startsWith("/") ? nextParamRaw : `/${nextParamRaw}`;
    }
  } catch {
    next = ROUTES.DASHBOARD;
  }

  console.log("Auth callback called:", {
    code: code ? "present" : "missing",
    error,
    errorDescription,
    origin,
    next,
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

  if (!code) {
    console.error("No authorization code provided");
    return NextResponse.redirect(`${origin}/auth/login?error=no_code&message=No%20authorization%20code`);
  }

  try {
    const supabase = await createServerSupabaseClient();

    console.log("Exchanging code for session...");
    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      console.error("Session exchange error:", sessionError);
      return NextResponse.redirect(`${origin}/auth/login?error=session_failed&message=${encodeURIComponent(sessionError.message)}`);
    }

    if (!data.user) {
      console.error("No user returned from session exchange");
      return NextResponse.redirect(`${origin}/auth/login?error=no_user&message=No%20user%20returned`);
    }

    console.log("Session exchanged successfully", { userId: data.user.id, email: data.user.email });

    // Ensure profile exists (but don't let this break the auth flow)
    try {
      await ensureProfile(data.user.id);
    } catch (profileError) {
      console.warn("Profile creation failed, but continuing with auth:", profileError);
    }

    // Create response and redirect
    const response = NextResponse.redirect(`${origin}${next}`, {
      status: 303, // Use 303 to ensure POST is not followed by GET
    });

    console.log("Redirecting to", next);
    return response;
  } catch (error) {
    console.error("Auth callback exception:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.redirect(`${origin}/auth/login?error=exception&message=${encodeURIComponent(errorMsg)}`);
  }
}
