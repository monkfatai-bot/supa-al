"use client";

/**
 * Supa AI — register form.
 *
 * Email + password + display name + "I accept the Terms" checkbox. Client-side
 * validation with `signUpSchema`. On submit: POST `/api/auth/signup` → on
 * success, if `needsEmailVerification` is `true`, switch to the `verify-email`
 * screen (forwarding `email` + `displayName` for personalization); otherwise
 * call `router.refresh()` (the server sees the session and renders the
 * dashboard). On error render `<AuthErrorAlert>` and extract per-field
 * messages for `VALIDATION_ERROR` responses. OAuth buttons below.
 *
 * @module @/components/auth/register-form
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { signUpSchema } from "@/lib/validation/auth";

import { useSignUp } from "@/hooks/use-auth";
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

export type RegisterFormProps = AuthScreenProps;

export function RegisterForm({ onScreenChange }: RegisterFormProps) {
  const router = useRouter();
  const signUp = useSignUp();
  const { errors, setErrors, clearField } = useFieldErrorReset();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [oauthError, setOauthError] = React.useState<AuthApiError | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setOauthError(null);

    const trimmedName = displayName.trim();
    const values = {
      email,
      password,
      displayName: trimmedName || undefined,
      acceptTerms,
    };
    const result = validateForm(signUpSchema, values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(null);

    signUp.mutate(
      {
        email: result.data.email,
        password: result.data.password,
        displayName: result.data.displayName,
        acceptTerms: result.data.acceptTerms,
      },
      {
        onSuccess: (data) => {
          if (data.needsEmailVerification) {
            toast.success("Account created!", {
              description: "Check your inbox to verify your email.",
            });
            // Forward the email so the verify-email screen can show it.
            onScreenChange("verify-email", {
              email: result.data.email,
              displayName: result.data.displayName,
            });
          } else {
            // No verification required — Supabase auto-confirmed. The
            // session cookie is set; let the server swap to the dashboard.
            toast.success(`Welcome to ${APP_NAME}!`);
            router.refresh();
          }
        },
        onError: (err) => {
          // Map server-side field errors back to per-field messages.
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

  const submitError = signUp.isError ? (signUp.error as AuthApiError) : oauthError;

  return (
    <AuthFormCard
      title="Create your account"
      description="Start building with Supa AI in under a minute."
      footer={
        <span className="text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => onScreenChange("login")}
            className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            Sign in
          </button>
        </span>
      }
    >
      <form
        onSubmit={handleSubmit}
        aria-label="Create account form"
        className="flex flex-col gap-4"
        noValidate
      >
        <AuthErrorAlert error={submitError ?? null} />

        <div className="grid gap-2">
          <Label htmlFor="register-name">Display name</Label>
          <div className="relative">
            <User
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="register-name"
              name="name"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                clearField("displayName");
              }}
              className="h-11 pl-10"
              placeholder="Ada Lovelace"
              aria-invalid={Boolean(fieldError(errors, "displayName")) || undefined}
              aria-describedby={fieldError(errors, "displayName") ? "register-name-error" : undefined}
            />
          </div>
          {fieldError(errors, "displayName") ? (
            <p id="register-name-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "displayName")}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="register-email">Email</Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="register-email"
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
              aria-describedby={fieldError(errors, "email") ? "register-email-error" : undefined}
            />
          </div>
          {fieldError(errors, "email") ? (
            <p id="register-email-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "email")}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="register-password">Password</Label>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <PasswordInput
              id="register-password"
              name="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearField("password");
              }}
              containerClassName="col-span-full"
              className="pl-10"
              placeholder="At least 8 characters, with a number"
              aria-invalid={Boolean(fieldError(errors, "password")) || undefined}
              aria-describedby={fieldError(errors, "password") ? "register-password-error" : undefined}
            />
          </div>
          {fieldError(errors, "password") ? (
            <p id="register-password-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "password")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Use 8+ characters with at least one uppercase letter and one number.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="register-terms"
              checked={acceptTerms}
              onCheckedChange={(v) => {
                setAcceptTerms(v === true);
                clearField("acceptTerms");
              }}
              aria-invalid={Boolean(fieldError(errors, "acceptTerms")) || undefined}
              aria-describedby={fieldError(errors, "acceptTerms") ? "register-terms-error" : undefined}
            />
            <Label
              htmlFor="register-terms"
              className="text-sm font-normal leading-relaxed text-muted-foreground"
            >
              I accept the{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </Label>
          </div>
          {fieldError(errors, "acceptTerms") ? (
            <p id="register-terms-error" role="alert" className="text-sm text-destructive">
              {fieldError(errors, "acceptTerms")}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={signUp.isPending}
          className="h-11 w-full bg-brand text-brand-foreground shadow-sm hover:bg-brand/90"
        >
          {signUp.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Creating account…</span>
              <span className="sr-only" role="status">
                Creating your account, please wait.
              </span>
            </>
          ) : (
            "Create account"
          )}
        </Button>

        <div className="relative my-2">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs uppercase tracking-wide text-muted-foreground">
            or continue with
          </span>
        </div>

        <OAuthButtons onError={setOauthError} />
      </form>
    </AuthFormCard>
  );
}
