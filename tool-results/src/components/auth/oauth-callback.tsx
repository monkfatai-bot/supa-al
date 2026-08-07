"use client";

/**
 * Supa AI — OAuth callback loading screen.
 *
 * Shown briefly during the OAuth redirect flow. This component is purely a
 * loading state — it does NOT make any API calls itself. The OAuth flow is:
 *
 *   1. Client calls `POST /api/auth/oauth/signin` → gets `{url}`.
 *   2. Client navigates the browser to `url` (full page navigation — the SPA
 *      is unmounted).
 *   3. Provider authenticates the user, redirects to `/api/auth/callback?code=...`.
 *   4. The callback route exchanges the code for a session cookie (server-side).
 *   5. The callback route redirects to `/?auth=success` (or to the safe
 *      `next` path the caller passed in step 1).
 *   6. The server component on `/` re-evaluates the session — if present,
 *      it renders the dashboard; if not, it renders `<AuthFlow>` which may
 *      show this `<OAuthCallback>` if the `?auth=callback` query is present.
 *
 * In practice this component shows for the brief window between the
 * browser landing on `/?auth=success` and the session cookie being readable
 * by `getSession()` (usually <1s). It exists so users never see a blank
 * page or a flash of the login form during that window.
 *
 * @module @/components/auth/oauth-callback
 */
import { Loader2 } from "lucide-react";

import { Logo } from "@/components/shared/logo";

export interface OAuthCallbackProps {
  /** Optional message override. Defaults to "Completing sign-in…". */
  message?: string;
}

export function OAuthCallback({
  message = "Completing sign-in…",
}: OAuthCallbackProps) {
  return (
    <div
      className="flex w-full max-w-sm flex-col items-center justify-center gap-4 px-6 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <Logo size={40} />
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
        <span className="text-sm font-medium">{message}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        You’ll be redirected automatically. If nothing happens, refresh the page.
      </p>
    </div>
  );
}
