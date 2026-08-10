"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/services/auth/validation";
import { updatePassword } from "@/services/auth";
import { AuthLayout } from "@/components/auth/auth-layout";
import { FormMessage } from "@/components/auth/form-message";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { PasswordInput } from "@/components/auth/password-input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/constants";

export function ResetPasswordCard() {
  const [formError, setFormError] = React.useState("");
  const [formSuccess, setFormSuccess] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  function onSubmit(values: ResetPasswordFormValues) {
    setFormError("");
    setFormSuccess("");
    startTransition(async () => {
      const result = await updatePassword(values.password);
      if (result.success) {
        setFormSuccess("Password updated successfully! Redirecting to login...");
      } else {
        setFormError(result.message);
      }
    });
  }

  if (formSuccess) {
    return (
      <AuthLayout
        title="Password updated"
        description="Your password has been changed"
        footer={
          <p>
            <Link
              href={ROUTES.LOGIN}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Log in with new password
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
      title="Set new password"
      description="Enter your new password below"
      footer={null}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {formError && <FormMessage type="error" message={formError} />}

        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            placeholder="Create a strong password"
            autoComplete="new-password"
            disabled={pending}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <PasswordInput
            id="confirmPassword"
            placeholder="Repeat your new password"
            autoComplete="new-password"
            disabled={pending}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <AuthSubmitButton pending={pending}>Update password</AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}
