import { updateSession } from "@/lib/supabase/middleware-client";
import { type NextRequest } from "next/server";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in; font-src 'self'; connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.deepseek.com https://openrouter.ai https://dashscope.aliyuncs.com https://api.x.ai; frame-ancestors 'none';",
};

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // Apply security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/test|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
