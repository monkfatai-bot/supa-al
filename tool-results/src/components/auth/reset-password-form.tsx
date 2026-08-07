"use client";

/**
 * Supa AI — reset-password form.
 *
 * New password + confirm password. Client-side validation with
 * `updatePasswordSchema`. POST `/api/auth/reset-password` → on success,
 * show "Password reset successfully" + auto-redirect to login after 3s.
 *
 * This screen is shown when `?mode=reset` query param is present (the user
 * clicked the reset link in the email, which set a session via the
 * `/api/auth/callback` PKCE exchange). The `AuthFlow` parent decides which
 * screen to show based on query params — this component is purely the form
 * that POSTs the new password.
 *
 * @module @/components/auth/reset-password-form
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordSchema } from "@/lib/validation/auth";

import { useResetPassword } from "@/hooks/use-auth";
import type { AuthApiError } from "@/hooks/use-auth";

import { AuthFormCard } from "./auth-form-card";
import { AuthErrorAlert } from "./auth-error-alert";
import { PasswordInput } from "./password-input";
import { fieldError, useFieldErrorReset, validateForm } from "./form-helpers";
import type { AuthScreenProps } from "./types";

export type ResetPasswordFormProps = AuthScreenProps;

const REDIRECT_DELAY_MS = 3000;

export function ResetPasswordForm({ onScreenChange }: ResetPasswordFormProps) {
  const router = useRouter();
  const resetPassword = useResetPassword();
  const { errors, setErrors, clearField } = useFieldErrorReset();

  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [done, setDone] = React.useState(false);

  // Auto-redirect to login after the success state has been visible for a
  // few seconds so the user has time to read the confirmation. Calling
  // `onScreenChange("login")` updates the in-flow state; we also call
  // `router.refresh()` to clear any lingering session cookie from the reset
  // flow (the user needs to sign in fresh with the new password).
  React.useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => {
      onScreenChange("login");
      router.refresh();
    }, REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [done, onScreenChange, router]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const result = validateForm(updatePasswordSchema, {
      password,
      confirmPassword,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(null);

    resetPassword.mutate(
      {
        password: result.data.password,
        confirmPassword: result.data.confirmPassword,
      },
      {
        onSuccess: () => {
          toast.success("Password reset successfully");
          setDone(true);
        },
        onError: (err) => {
          const fields = (err.details?.fields as Array<{ path: string; message: string }> | undefined) ?? [];
          if (fields.length > 0) {
            const fieldErrors: Record<string, string> = {};
            for (const f of fields) fieldErrors[f.path] = f.message;
            setErrors(fieldErrors);
          }
        },
      },
    );
  };

  if (done) {
    return (
      <AuthFormCard
        title="Password reset"
        description="You can now sign in with your new password."
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
            Your password has been reset successfully. Redirecting you to sign
            in…
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-2 h-11 w-full"
            onClick={() => {
              onScreenChange("login");
              router.refresh();
            }}
          >
            Go to sign in now
          </Button>
        </div>
      </AuthFormCard>
    );
  }

  return (
    <AuthFormCard
      title="Set a new password"
      description="Choose a strong password you haven’t used before."
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
        aria-label="Reset password form"
        className="flex flex-col gap-4"
        noValidate
      >
        <AuthErrorAlert
          error={resetPassword.isError ? (resetPassword.error as AuthApiError) : null}
        />

        <div className="grid gap-2">
          <Label htmlFor="reset-password">New password</Label>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <PasswordInput
              id="reset-password"
              name="new-password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearField("password");
                // Confirm-password equality check is in the schema refine;
                // clear its error too so the user can re-type.
                clearField("confirmPassword");
              }}
              containerClassName="col-span-full"
              className="pl-10"
              placeholder="At least 8 characters, with a number"
              aria-invalid={Boolean(fieldError(errors, "password")) || undefined}
              aria-describedby={fieldError(errors, "password") ? "reset-password-error" : undefined}
            />
          </div>
          {fieldError(errors, "password") ? (
            <p id="reset-password-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "password")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Use 8+ characters with at least one uppercase letter and one number.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="reset-confirm">Confirm new password</Label>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <PasswordInput
              id="reset-confirm"
              name="confirm-password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearField("confirmPassword");
              }}
              containerClassName="col-span-full"
              className="pl-10"
              placeholder="Re-enter your new password"
              aria-invalid={Boolean(fieldError(errors, "confirmPassword")) || undefined}
              aria-describedby={fieldError(errors, "confirmPassword") ? "reset-confirm-error" : undefined}
            />
          </div>
          {fieldError(errors, "confirmPassword") ? (
            <p id="reset-confirm-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "confirmPassword")}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={resetPassword.isPending}
          className="h-11 w-full bg-brand text-brand-foreground shadow-sm hover:bg-brand/90"
        >
          {resetPassword.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Resetting password…</span>
              <span className="sr-only" role="status">
                Resetting your password, please wait.
              </span>
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthFormCard>
  );
}
