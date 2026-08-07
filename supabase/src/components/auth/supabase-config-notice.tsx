"use client";

/**
 * Supa AI — Supabase configuration notice.
 *
 * When Supabase isn't configured (env vars missing), the auth backend
 * can't actually authenticate anyone — every `/api/auth/*` request will
 * fail with a real network/config error. Rather than silently letting users
 * discover this by submitting the form and getting an opaque 500, we render
 * a non-blocking banner at the top of the auth screen explaining the
 * situation and pointing to the deployment doc.
 *
 * The forms remain functional — they're NOT mocked. A real error from the
 * server will surface in `<AuthErrorAlert>` as usual; this banner is just a
 * courtesy heads-up so the developer setting up the project understands
 * why their login attempts are failing.
 *
 * The orchestrator's `/` page passes `supabaseConfigured: boolean` (read
 * from the validated `env`) down to `<AuthFlow>`, which forwards it here.
 *
 * @module @/components/auth/supabase-config-notice
 */
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface SupabaseConfigNoticeProps {
  /** `false` when `env.supabase.url` or `env.supabase.anonKey` is missing. */
  supabaseConfigured: boolean;
}

export function SupabaseConfigNotice({ supabaseConfigured }: SupabaseConfigNoticeProps) {
  if (supabaseConfigured) return null;

  return (
    <Alert
      variant="default"
      role="status"
      className="border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200"
    >
      <TriangleAlert aria-hidden="true" className="text-amber-600 dark:text-amber-400" />
      <AlertTitle>Authentication requires Supabase</AlertTitle>
      <AlertDescription>
        <p className="text-sm">
          Set <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-xs">SUPABASE_URL</code>{" "}
          and{" "}
          <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-xs">SUPABASE_ANON_KEY</code>{" "}
          in your environment to enable sign-in. See{" "}
          <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-xs">DEPLOYMENT.md</code>{" "}
          for the full configuration guide.
        </p>
      </AlertDescription>
    </Alert>
  );
}
