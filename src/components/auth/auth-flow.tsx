"use client";

/**
 * Supa AI — auth flow container (Phase 2 UI root).
 *
 * The top-level client component rendered by `/` when the server side finds
 * no authenticated session. Owns the auth screen state machine
 * (`login | register | forgot-password | reset-password | verify-email |
 * oauth-callback`) and the small context object forwarded between screens
 * (the new user's email, so the verify-email screen can render "Check your
 * email at {email}").
 *
 * Initial screen is derived from the URL search params on mount:
 *
 *   - `?auth_error=...`     → `login` screen, `<AuthErrorAlert>` pre-filled
 *                              with the slug's friendly message.
 *   - `?auth=success`       → `oauth-callback` screen (brief loading state
 *                              before the session cookie is read by the
 *                              server's `getSession()`).
 *   - `?auth=callback`      → same as `?auth=success`.
 *   - `?mode=reset`         → `reset-password` screen (the user clicked the
 *                              reset email link, which set a session via
 *                              the PKCE callback).
 *   - `?mode=verify`        → `verify-email` screen (the user landed back
 *                              here after clicking the verification link,
 *                              but the session may not yet be ready).
 *
 * After a successful login / register / verification, the active form calls
 * `router.refresh()` so the server component re-evaluates the session cookie
 * and swaps from `<AuthFlow>` → dashboard WITHOUT a full page reload.
 *
 * @module @/components/auth/auth-flow
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { AuthLayout } from "./auth-layout";
import { SupabaseConfigNotice } from "./supabase-config-notice";
import { AuthErrorAlert, slugToAuthError } from "./auth-error-alert";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";
import { VerifyEmailForm } from "./verify-email-form";
import { OAuthCallback } from "./oauth-callback";
import type {
  AuthScreen,
  AuthScreenContext,
  OnScreenChange,
} from "./types";
import type { AuthApiError } from "@/hooks/use-auth";

export interface AuthFlowProps {
  /**
   * Whether Supabase is configured (env vars present). When `false`, a
   * non-blocking amber banner is shown at the top of the auth screen. The
   * forms remain functional — they'll surface real network errors when
   * submitted.
   */
  supabaseConfigured: boolean;
}

/** Derive the initial screen + error from URL search params. */
function readInitialScreen(
  params: URLSearchParams,
): { screen: AuthScreen; context: AuthScreenContext; error: AuthApiError | null } {
  const authError = params.get("auth_error");
  if (authError) {
    return { screen: "login", context: {}, error: slugToAuthError(authError) };
  }

  const auth = params.get("auth");
  if (auth === "success" || auth === "callback") {
    return { screen: "oauth-callback", context: {}, error: null };
  }

  const mode = params.get("mode");
  if (mode === "reset") {
    return { screen: "reset-password", context: {}, error: null };
  }
  if (mode === "verify") {
    return { screen: "verify-email", context: {}, error: null };
  }

  return { screen: "login", context: {}, error: null };
}

const SCREEN_VARIANTS = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const SCREEN_TRANSITION = { duration: 0.2, ease: "easeOut" as const };

export function AuthFlow({ supabaseConfigured }: AuthFlowProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive initial screen + error from the URL ONCE on mount. Subsequent
  // param changes don't re-trigger this — we want the user's in-flow
  // navigation (login → forgot-password → login) to drive the screen, not
  // the URL.
  const initial = React.useMemo(() => {
    // `useSearchParams` returns a read-only URLSearchParams-like object; we
    // construct a plain URLSearchParams to be safe across SSR/CSR.
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    return readInitialScreen(params);
  }, [searchParams]);

  const [screen, setScreen] = React.useState<AuthScreen>(initial.screen);
  const [context, setContext] = React.useState<AuthScreenContext>(initial.context);
  const [initialError] = React.useState<AuthApiError | null>(initial.error);

  // If we landed via `?auth=success` (OAuth callback just exchanged the code),
  // the session cookie may not be readable by `getSession()` for one render
  // cycle. Poll `router.refresh()` a few times so the server re-evaluates
  // the session. Once the server sees the session, it swaps the rendered
  // tree from `<AuthFlow>` → dashboard and this component unmounts.
  React.useEffect(() => {
    if (screen !== "oauth-callback") return;
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      router.refresh();
    };
    // Stagger a few refreshes — the cookie is usually readable by the second.
    const t1 = window.setTimeout(refresh, 250);
    const t2 = window.setTimeout(refresh, 1000);
    const t3 = window.setTimeout(refresh, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [screen, router]);

  const handleScreenChange = React.useCallback<OnScreenChange>(
    (next, ctx) => {
      setScreen(next);
      if (ctx) {
        setContext((prev) => ({ ...prev, ...ctx }));
      }
    },
    [],
  );

  const renderScreen = () => {
    switch (screen) {
      case "login":
        return <LoginForm onScreenChange={handleScreenChange} />;
      case "register":
        return <RegisterForm onScreenChange={handleScreenChange} />;
      case "forgot-password":
        return <ForgotPasswordForm onScreenChange={handleScreenChange} />;
      case "reset-password":
        return <ResetPasswordForm onScreenChange={handleScreenChange} />;
      case "verify-email":
        return (
          <VerifyEmailForm
            onScreenChange={handleScreenChange}
            initialContext={context}
          />
        );
      case "oauth-callback":
        return <OAuthCallback />;
      default:
        return <LoginForm onScreenChange={handleScreenChange} />;
    }
  };

  return (
    <AuthLayout
      banner={
        <>
          <SupabaseConfigNotice supabaseConfigured={supabaseConfigured} />
          {/* Surface OAuth callback / link errors at the top of the flow so
              they're visible regardless of which screen is active. */}
          {initialError ? (
            <AuthErrorAlert error={initialError} />
          ) : null}
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screen}
          variants={SCREEN_VARIANTS}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SCREEN_TRANSITION}
          className="w-full"
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  );
}
