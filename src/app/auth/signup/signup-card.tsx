"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupFormValues } from "@/services/auth/validation";
import { signup, resendVerification } from "@/services/auth";
import { AuthLayout } from "@/components/auth/auth-layout";
import { FormMessage } from "@/components/auth/form-message";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialLogin } from "@/components/auth/social-login";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/config/constants";

export function SignupCard() {
  const [formError, setFormError] = React.useState("");
  const [formSuccess, setFormSuccess] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [signupEmail, setSignupEmail] = React.useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  function onSubmit(values: SignupFormValues) {
    setFormError("");
    setFormSuccess("");
    startTransition(async () => {
      const result = await signup({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      });
      if (result.success) {
        setSignupEmail(values.email);
        setFormSuccess(result.message);
      } else {
        setFormError(result.message);
      }
    });
  }

  function handleResendVerification() {
    if (!signupEmail) return;
    setFormError("");
    startTransition(async () => {
      const result = await resendVerification(signupEmail);
      if (result.success) {
        setFormSuccess(result.message);
      } else {
        setFormError(result.message);
      }
    });
  }

  // Show verification confirmation state
  if (formSuccess) {
    return (
      <AuthLayout
        title="Check your email"
        description="We've sent you a verification link"
        footer={
          <p>
            Already verified?{" "}
            <Link
              href={ROUTES.LOGIN}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          </p>
        }
      >
        <FormMessage type="success" message={formSuccess} />
        <button
          type="button"
          onClick={handleResendVerification}
          disabled={pending}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
        >
          {pending ? "Sending..." : "Resend verification email"}
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create an account"
      description="Get started with Supa AI"
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href={ROUTES.LOGIN}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {formError && <FormMessage type="error" message={formError} />}

        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Jane Doe"
            autoComplete="name"
            disabled={pending}
            {...register("fullName")}
          />
          {errors.fullName && (
            <p className="text-xs text-destructive">{errors.fullName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            disabled={pending}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            placeholder="Create a strong password"
            disabled={pending}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            placeholder="Repeat your password"
            autoComplete="new-password"
            disabled={pending}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <AuthSubmitButton pending={pending}>Create account</AuthSubmitButton>

        <SocialLogin />
      </form>
    </AuthLayout>
  );
}
