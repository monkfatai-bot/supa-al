import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/config/env";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=${error}`);
  }

  if (!code || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(`${origin}/auth/login`);
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
          setAll(cookiesToSet: any[]) {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });
          },
        },
      }
    );

    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !data.user) {
      return NextResponse.redirect(`${origin}/auth/login`);
    }

    // Return HTML with meta refresh to allow cookies to be set before redirect
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${origin}/chat" />
  <title>Loading...</title>
</head>
<body>
  <script>window.location.href = "${origin}/chat";</script>
</body>
</html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    // Set all cookies from request onto response
    request.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value, {
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        secure: true,
      });
    });

    return response;
  } catch (error) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }
}
