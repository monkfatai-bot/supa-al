"use client";

/**
 * Supa AI — auth form card.
 *
 * Presentational wrapper shared by every auth screen (login, register,
 * forgot-password, reset-password, verify-email). Renders a Card with a
 * consistent header (title + description) and a footer slot for the
 * "switch screen" links ("Don't have an account? Sign up").
 *
 * Kept intentionally free of business logic — every screen composes this
 * with its own form, OAuth buttons, and error alert.
 *
 * @module @/components/auth/auth-form-card
 */
import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AuthFormCardProps {
  /** Visible card title (e.g. "Sign in", "Create your account"). */
  title: string;
  /** Optional subtitle shown under the title. */
  description?: string;
  /** The form body (inputs, buttons, OAuth, error alert). */
  children: React.ReactNode;
  /** Optional footer — typically the "switch screen" link. */
  footer?: React.ReactNode;
  /** Optional className on the underlying `Card`. */
  className?: string;
}

export function AuthFormCard({
  title,
  description,
  children,
  footer,
  className,
}: AuthFormCardProps) {
  return (
    <Card
      className={cn(
        "w-full max-w-sm border-border/60 shadow-lg shadow-black/[0.03] dark:shadow-black/20",
        className,
      )}
    >
      <CardHeader className="gap-1.5">
        <CardTitle className="text-xl tracking-tight">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-sm">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? <CardFooter className="justify-center text-sm">{footer}</CardFooter> : null}
    </Card>
  );
}
