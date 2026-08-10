import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/services/integration-hub/oauth-manager";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const provider = searchParams.get("provider");

    if (!code || !state || !provider) {
      const redirectUrl = new URL("/integrations/oauth", request.url);
      redirectUrl.searchParams.set("error", "Missing required parameters (code, state, provider).");
      return NextResponse.redirect(redirectUrl.toString());
    }

    const result = await handleOAuthCallback({
      code,
      state,
      provider: provider as "google" | "microsoft" | "github" | "gitlab" | "bitbucket" | "slack" | "discord" | "telegram" | "stripe" | "paystack" | "flutterwave" | "shopify" | "woocommerce" | "dropbox" | "box" | "openai" | "anthropic" | "google_gemini" | "grok" | "deepseek" | "qwen" | "openrouter",
    });

    const redirectUrl = new URL("/integrations/oauth", request.url);

    if (result.success) {
      redirectUrl.searchParams.set("success", "true");
    } else {
      redirectUrl.searchParams.set("error", result.message);
    }

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed.";
    const redirectUrl = new URL("/integrations/oauth", request.url);
    redirectUrl.searchParams.set("error", message);
    return NextResponse.redirect(redirectUrl.toString());
  }
}
