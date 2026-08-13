import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { env } from "@/config/env";

export async function GET() {
  const supabase = await createServerSupabaseClient();

  // Check Supabase configuration
  const config = {
    url: env.NEXT_PUBLIC_SUPABASE_URL ? "✅ Set" : "❌ Missing",
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "✅ Set" : "❌ Missing",
    serviceRole: env.SUPABASE_SERVICE_ROLE_KEY ? "✅ Set" : "❌ Missing",
  };

  // Try to get auth user (should be null since no session)
  const { data, error } = await supabase.auth.getUser();

  return NextResponse.json({
    message: "Supabase Configuration Test",
    environment: config,
    authTest: {
      user: data.user ? `✅ Auth works (${data.user.email})` : "✅ Auth initialized (no user logged in)",
      error: error ? `❌ ${error.message}` : null,
    },
    siteUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : env.NEXT_PUBLIC_APP_URL,
  });
}
