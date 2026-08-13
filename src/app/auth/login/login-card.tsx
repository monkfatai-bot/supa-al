"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginFormValues } from "@/services/auth/validation";
import { login } from "@/services/auth";
import { AuthLayout } from "@/components/auth/auth-layout";
import { FormMessage } from "@/components/auth/form-message";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialLogin } from "@/components/auth/social-login";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/config/constants";
import { useRouter } from "next/navigation";

export function LoginCard() {
  const [formError, setFormError] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginFormValues) {
    setFormError("");
    startTransition(async () => {
      const result = await login(values);
      if (!result.success) {
        setFormError(result.message);
      } else {
        // Navigate client-side after successful login
        router.push(ROUTES.DASHBOARD);
      }
    });
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Enter your credentials to access your account"
      footer={
        <p>
          Don't have an account?{" "}
          <Link
            href={ROUTES.SIGNUP}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign up
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href={ROUTES.FORGOT_PASSWORD}
              className="text-xs text-muted-foreground hover:text-primary"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            placeholder="Enter your password"
            disabled={pending}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="remember"
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="remember" className="text-sm font-normal">
            Remember me
          </Label>
        </div>

        <AuthSubmitButton pending={pending}>Log in</AuthSubmitButton>

        <SocialLogin />
      </form>
    </AuthLayout>
  );
}
