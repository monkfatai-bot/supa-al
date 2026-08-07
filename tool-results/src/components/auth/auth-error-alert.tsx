"use client";

/**
 * Supa AI — auth error alert.
 *
 * Maps the structured {@link AuthApiError} payload returned by every
 * `/api/auth/*` route (and thrown by every hook in `use-auth.ts`) to a
 * friendly, user-facing message rendered inside a destructive shadcn
 * `Alert`. Returns `null` when `error` is `null` so forms can render it
 * unconditionally with the current mutation error.
 *
 * The server already does the Supabase → AppError mapping (see
 * `mapSupabaseAuthError` in `src/lib/auth/auth-service.ts`), so by the time
 * the error reaches the client it's a stable code (`AUTHENTICATION_ERROR`,
 * `RATE_LIMIT_ERROR`, `CONFLICT_ERROR`, …) with a message that's already
 * safe to surface. This component just adds:
 *
 *   - a friendlier *prefix* per code (e.g. "Sign-in failed." for
 *     `AUTHENTICATION_ERROR`),
 *   - extraction of `details.retryAfter` for rate-limit errors (renders
 *     "Try again in N min."),
 *   - extraction of `details.fields` for validation errors (renders the
 *     first field-level message inline so the user sees the most
 *     actionable detail).
 *
 * Secrets are NEVER shown — the server already hides them via
 * `apiError()`'s `internal` flag.
 *
 * @module @/components/auth/auth-error-alert
 */
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { AuthApiError } from "@/hooks/use-auth";

export interface AuthErrorAlertProps {
  /** The mutation error (or `null`). */
  error: AuthApiError | null;
  /**
   * Optional friendly title. Defaults to a per-code label (e.g. "Sign-in
   * failed.", "Too many attempts.", "Already registered.").
   */
  title?: string;
  /** Optional extra className on the underlying `Alert`. */
  className?: string;
}

/**
 * Per-code friendly prefix. The error `message` from the server is appended
 * below the title.
 */
const CODE_TITLE: Record<string, string> = {
  VALIDATION_ERROR: "Check your input",
  AUTHENTICATION_ERROR: "Sign-in failed",
  AUTHORIZATION_ERROR: "Not allowed",
  NOT_FOUND_ERROR: "Not found",
  CONFLICT_ERROR: "Already exists",
  RATE_LIMIT_ERROR: "Too many attempts",
  PAYMENT_ERROR: "Payment failed",
  AI_PROVIDER_ERROR: "AI provider error",
  DATABASE_ERROR: "Server error",
  STORAGE_ERROR: "Storage error",
  EXTERNAL_SERVICE_ERROR: "Service unavailable",
  CONFIGURATION_ERROR: "Setup required",
  INTERNAL_ERROR: "Something went wrong",
};

/** Friendly label for an OAuth callback error slug (the `?auth_error=` query). */
export const AUTH_ERROR_SLUGS: Record<string, string> = {
  missing_code: "The sign-in link was incomplete. Please try again.",
  auth_failed: "We couldn't authenticate you with that provider. Please try again.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  exchange_failed: "Sign-in could not be completed. Please try again.",
  access_denied: "You cancelled the sign-in. Please try again when you're ready.",
  invalid_request: "The sign-in request was invalid. Please try again.",
};

/** Format seconds as a friendly "1 min" / "5 min" / "30 s" label. */
function formatRetryAfter(seconds: number): string {
  if (seconds <= 0) return "a moment";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

export function AuthErrorAlert({ error, title, className }: AuthErrorAlertProps) {
  if (!error) return null;

  const code = error.code ?? "INTERNAL_ERROR";
  const message = error.message ?? "An unexpected error occurred. Please try again.";
  const resolvedTitle = title ?? CODE_TITLE[code] ?? "Something went wrong";

  // Extra hint for rate-limit errors: surface the Retry-After as a friendly
  // countdown (the server sets it from RateLimitError.retryAfter).
  const retryAfter = (error.details?.retryAfter as number | undefined) ?? null;
  const retryHint =
    code === "RATE_LIMIT_ERROR" && typeof retryAfter === "number" && retryAfter > 0
      ? ` Try again in ${formatRetryAfter(retryAfter)}.`
      : "";

  // For validation errors, surface the first field-level message inline so
  // the user sees the most actionable detail. The full set is still shown
  // under each input via the form's per-field error rendering.
  const fields =
    (error.details?.fields as Array<{ path: string; message: string }> | undefined) ?? [];
  const fieldHint = fields.length > 0 ? fields[0]?.message : null;

  return (
    <Alert
      variant="destructive"
      role="alert"
      className={cn("animate-in fade-in slide-in-from-top-1", className)}
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{resolvedTitle}</AlertTitle>
      <AlertDescription>
        <p>
          {message}
          {retryHint}
        </p>
        {fieldHint && fieldHint !== message ? (
          <p className="text-xs opacity-80">{fieldHint}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Convert an `?auth_error=...` slug from the OAuth callback redirect into an
 * `AuthApiError`-shaped object so it can be rendered by the same component.
 */
export function slugToAuthError(slug: string | null | undefined): AuthApiError | null {
  if (!slug) return null;
  const message = AUTH_ERROR_SLUGS[slug] ?? "Authentication failed. Please try again.";
  return {
    code: "AUTHENTICATION_ERROR",
    message,
  };
}
