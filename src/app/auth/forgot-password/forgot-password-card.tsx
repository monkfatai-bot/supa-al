"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/services/auth/validation";
import { resetPassword } from "@/services/auth";
import { AuthLayout } from "@/components/auth/auth-layout";
import { FormMessage } from "@/components/auth/form-message";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/config/constants";

export function ForgotPasswordCard() {
  const [formError, setFormError] = React.useState("");
  const [formSuccess, setFormSuccess] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  function onSubmit(values: ForgotPasswordFormValues) {
    setFormError("");
    setFormSuccess("");
    startTransition(async () => {
      const result = await resetPassword(values.email);
      if (result.success) {
        setFormSuccess(result.message);
      } else {
        setFormError(result.message);
      }
    });
  }

  if (formSuccess) {
    return (
      <AuthLayout
        title="Check your email"
        description="Password reset link sent"
        footer={
          <p>
            Back to{" "}
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
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we'll send you a reset link"
      footer={
        <p>
          Remember your password?{" "}
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

        <AuthSubmitButton pending={pending}>Send reset link</AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}
