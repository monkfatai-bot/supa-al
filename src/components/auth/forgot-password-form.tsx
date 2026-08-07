"use client";

/**
 * Supa AI — forgot-password form.
 *
 * Email field only. POST `/api/auth/forgot-password`. ALWAYS shows a success
 * message ("If an account exists for that email, we've sent a reset link.")
 * regardless of the response — the server enforces this anti-enumeration
 * contract too, but we duplicate it client-side so even a network error
 * doesn't reveal whether the email exists.
 *
 * Link back to login.
 *
 * @module @/components/auth/forgot-password-form
 */
import * as React from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordResetSchema } from "@/lib/validation/auth";

import { useForgotPassword } from "@/hooks/use-auth";
import type { AuthApiError } from "@/hooks/use-auth";

import { AuthFormCard } from "./auth-form-card";
import { AuthErrorAlert } from "./auth-error-alert";
import { fieldError, useFieldErrorReset, validateForm } from "./form-helpers";
import type { AuthScreenProps } from "./types";

export type ForgotPasswordFormProps = AuthScreenProps;

export function ForgotPasswordForm({ onScreenChange }: ForgotPasswordFormProps) {
  const forgotPassword = useForgotPassword();
  const { errors, setErrors, clearField } = useFieldErrorReset();

  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const result = validateForm(passwordResetSchema, { email });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(null);

    forgotPassword.mutate(
      { email: result.data.email },
      {
        onSuccess: () => setSubmitted(true),
        // Per the privacy contract, we treat a network/config error the same
        // as a success — never reveal whether the email exists. A real
        // network failure is still surfaced via the AuthErrorAlert so the
        // developer can see what went wrong, but the success message also
        // shows so a user attempting to enumerate accounts gets nothing.
        onError: () => setSubmitted(true),
      },
    );
  };

  if (submitted) {
    return (
      <AuthFormCard
        title="Check your inbox"
        description="If an account exists, a reset link is on its way."
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
        <div
          className="flex flex-col items-center gap-3 py-4 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account exists for{" "}
            <span className="font-medium text-foreground">{email || "that email"}</span>,
            we’ve sent a reset link. The link expires in 60 minutes.
          </p>
          <p className="text-xs text-muted-foreground">
            Didn’t get the email? Check your spam folder, or{" "}
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                forgotPassword.reset();
              }}
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              try a different email
            </button>
            .
          </p>
        </div>
      </AuthFormCard>
    );
  }

  return (
    <AuthFormCard
      title="Forgot password"
      description="Enter your email and we’ll send you a reset link."
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
      <form
        onSubmit={handleSubmit}
        aria-label="Forgot password form"
        className="flex flex-col gap-4"
        noValidate
      >
        <AuthErrorAlert
          error={forgotPassword.isError ? (forgotPassword.error as AuthApiError) : null}
        />

        <div className="grid gap-2">
          <Label htmlFor="forgot-email">Email</Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearField("email");
              }}
              className="h-11 pl-10"
              placeholder="you@example.com"
              aria-invalid={Boolean(fieldError(errors, "email")) || undefined}
              aria-describedby={fieldError(errors, "email") ? "forgot-email-error" : undefined}
            />
          </div>
          {fieldError(errors, "email") ? (
            <p id="forgot-email-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "email")}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={forgotPassword.isPending}
          className="h-11 w-full bg-brand text-brand-foreground shadow-sm hover:bg-brand/90"
        >
          {forgotPassword.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Sending reset link…</span>
              <span className="sr-only" role="status">
                Sending reset link, please wait.
              </span>
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </form>
    </AuthFormCard>
  );
}
