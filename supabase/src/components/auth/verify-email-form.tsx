"use client";

/**
 * Supa AI — verify-email screen.
 *
 * Shown after a successful signup that returned `needsEmailVerification:
 * true` (Supabase didn't auto-confirm). Renders a "Check your email" message
 * with the user's email (forwarded from the register form via the parent
 * flow's `initialContext.email`).
 *
 * Two CTAs:
 *
 *   1. "Resend verification" — POST `/api/auth/resend-verification`. Shows
 *      a 30s cooldown (Supabase rate-limits resends) after each send.
 *   2. "I've verified — continue" — calls `router.refresh()` so the server
 *      component re-evaluates the session. If the user clicked the
 *      verification link in the email, Supabase has established a session
 *      cookie and the server will swap from `<AuthFlow>` → dashboard. If
 *      not, the page will re-render this screen.
 *
 * @module @/components/auth/verify-email-form
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { useResendVerification } from "@/hooks/use-auth";
import type { AuthApiError } from "@/hooks/use-auth";

import { AuthFormCard } from "./auth-form-card";
import { AuthErrorAlert } from "./auth-error-alert";
import type { AuthScreenProps } from "./types";

export type VerifyEmailFormProps = AuthScreenProps;

/** Cooldown (seconds) for the resend button — matches Supabase's default. */
const RESEND_COOLDOWN_SECONDS = 30;

export function VerifyEmailForm({ onScreenChange, initialContext }: VerifyEmailFormProps) {
  const router = useRouter();
  const resend = useResendVerification();

  const email = initialContext?.email ?? null;
  const displayName = initialContext?.displayName ?? null;

  const [cooldown, setCooldown] = React.useState(0);

  // 30s countdown after a resend so the user can't spam the button (Supabase
  // would 429 them anyway, but a visible cooldown is friendlier UX).
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleResend = () => {
    if (cooldown > 0 || resend.isPending) return;
    resend.mutate(undefined, {
      onSuccess: () => {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        toast.success("Verification email sent", {
          description: "Check your inbox (and spam folder) for the new link.",
        });
      },
    });
  };

  const handleContinue = () => {
    // Re-evaluate the server session. If the verification link was clicked,
    // the session cookie is set and the server swaps to the dashboard. If
    // not, this screen re-renders.
    router.refresh();
  };

  return (
    <AuthFormCard
      title="Check your email"
      description={
        displayName
          ? `Hi ${displayName} — almost there. Verify your email to finish signing up.`
          : "Almost there. Verify your email to finish signing up."
      }
      footer={
        <button
          type="button"
          onClick={() => onScreenChange("login")}
          className="inline-flex items-center gap-1.5 font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to sign in
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <AuthErrorAlert error={resend.isError ? (resend.error as AuthApiError) : null} />

        <div
          className="flex flex-col items-center gap-3 py-2 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
            <MailCheck className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">
              {email ?? "your email"}
            </span>
            . Click the link in the email to activate your account.
          </p>
          <p className="text-xs text-muted-foreground">
            The link expires in 24 hours. Didn’t get it? Check your spam folder
            or click resend below.
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={handleContinue}
          className="h-11 w-full bg-brand text-brand-foreground shadow-sm hover:bg-brand/90"
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          I’ve verified — continue
        </Button>

        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={handleResend}
          disabled={cooldown > 0 || resend.isPending}
          className="h-11 w-full"
        >
          {resend.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Sending…</span>
              <span className="sr-only" role="status">
                Sending verification email, please wait.
              </span>
            </>
          ) : cooldown > 0 ? (
            <span>Resend in {cooldown}s</span>
          ) : (
            "Resend verification email"
          )}
        </Button>
      </div>
    </AuthFormCard>
  );
}
