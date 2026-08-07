"use client";

/**
 * Supa AI — login form.
 *
 * Email + password fields, "Remember me" checkbox, "Forgot password?" link,
 * submit button. Client-side validation with `signInSchema`. On submit:
 * POST `/api/auth/signin` → on success call `router.refresh()` (so the
 * server component re-evaluates the session and swaps from `<AuthFlow>` →
 * dashboard without a full reload) → on error render `<AuthErrorAlert>`.
 * Renders the OAuth buttons below with an "or continue with" separator.
 *
 * @module @/components/auth/login-form
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { signInSchema } from "@/lib/validation/auth";

import { useSignIn } from "@/hooks/use-auth";
import type { AuthApiError } from "@/hooks/use-auth";
import { APP_NAME } from "@/lib/constants/app";

import { AuthFormCard } from "./auth-form-card";
import { AuthErrorAlert } from "./auth-error-alert";
import { OAuthButtons } from "./oauth-buttons";
import { PasswordInput } from "./password-input";
import {
  fieldError,
  useFieldErrorReset,
  validateForm,
} from "./form-helpers";
import type { AuthScreenProps } from "./types";

export type LoginFormProps = AuthScreenProps;

export function LoginForm({ onScreenChange }: LoginFormProps) {
  const router = useRouter();
  const signIn = useSignIn();
  const { errors, setErrors, clearField } = useFieldErrorReset();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(true);
  const [oauthError, setOauthError] = React.useState<AuthApiError | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setOauthError(null);

    const values = { email, password, rememberMe };
    const result = validateForm(signInSchema, values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(null);

    signIn.mutate(
      {
        email: result.data.email,
        password: result.data.password,
        rememberMe: result.data.rememberMe,
      },
      {
        onSuccess: () => {
          toast.success("Welcome back!", {
            description: `You’re signed in to ${APP_NAME}.`,
          });
          // Re-evaluate the server session — swaps <AuthFlow> → dashboard.
          router.refresh();
        },
        onError: (err) => {
          // Brute-force / network / credential errors all flow through here.
          // Validation errors are extracted to per-field messages when present.
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

  const submitError = signIn.isError ? (signIn.error as AuthApiError) : oauthError;

  return (
    <AuthFormCard
      title="Sign in"
      description="Welcome back. Enter your credentials to continue."
      footer={
        <span className="text-muted-foreground">
          Don’t have an account?{" "}
          <button
            type="button"
            onClick={() => onScreenChange("register")}
            className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            Sign up
          </button>
        </span>
      }
    >
      <form
        onSubmit={handleSubmit}
        aria-label="Sign in form"
        className="flex flex-col gap-4"
        noValidate
      >
        <AuthErrorAlert error={submitError ?? null} />

        <div className="grid gap-2">
          <Label htmlFor="login-email">Email</Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="login-email"
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
              aria-describedby={fieldError(errors, "email") ? "login-email-error" : undefined}
            />
          </div>
          {fieldError(errors, "email") ? (
            <p id="login-email-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "email")}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <button
              type="button"
              onClick={() => onScreenChange("forgot-password")}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearField("password");
              }}
              containerClassName="col-span-full"
              className="pl-10"
              placeholder="Your password"
              aria-invalid={Boolean(fieldError(errors, "password")) || undefined}
              aria-describedby={fieldError(errors, "password") ? "login-password-error" : undefined}
            />
          </div>
          {fieldError(errors, "password") ? (
            <p id="login-password-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "password")}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="login-remember"
            checked={rememberMe}
            onCheckedChange={(v) => setRememberMe(v === true)}
          />
          <Label htmlFor="login-remember" className="text-sm font-normal text-muted-foreground">
            Remember me for 30 days
          </Label>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={signIn.isPending}
          className="h-11 w-full bg-brand text-brand-foreground shadow-sm hover:bg-brand/90"
        >
          {signIn.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Signing in…</span>
              <span className="sr-only" role="status">
                Signing in, please wait.
              </span>
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        <div className="relative my-2">
          <Separator />
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs uppercase tracking-wide text-muted-foreground"
          >
            or continue with
          </span>
        </div>

        <OAuthButtons onError={setOauthError} />
      </form>
    </AuthFormCard>
  );
}
