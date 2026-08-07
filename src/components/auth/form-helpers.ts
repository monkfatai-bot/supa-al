"use client";

/**
 * Supa AI — auth form helpers.
 *
 * Tiny utilities shared by every auth screen form. Kept here (rather than
 * inlined in each form) so the per-field error mapping stays consistent.
 *
 * @module @/components/auth/form-helpers
 */
import * as React from "react";

import type { z } from "zod";

/**
 * Run a Zod schema against `values`. On success returns `{ ok, data }`; on
 * failure returns `{ ok: false, errors }` where `errors` is a `Record<string,
 * string>` keyed by the field path (`"email"`, `"password"`, etc.) with the
 * first issue's message per path.
 *
 * Top-level refine errors (which carry an empty path) are surfaced under
 * the special key `"form"` so the form can render them in the error alert
 * without colliding with a real field name.
 */
export function validateForm<S extends z.ZodType>(
  schema: S,
  values: unknown,
):
  | { ok: true; data: z.infer<S> }
  | { ok: false; errors: Record<string, string> } {
  const result = schema.safeParse(values);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    // First error per field wins — additional issues on the same field are
    // surfaced only after the first is resolved.
    if (errors[key] === undefined) {
      errors[key] = issue.message;
    }
  }
  return { ok: false, errors };
}

/** Convenience: returns the message for `field` or `undefined`. */
export function fieldError(
  errors: Record<string, string> | null | undefined,
  field: string,
): string | undefined {
  return errors?.[field];
}

/** Aria props for an input with a possible field error. */
export function ariaForField(
  errors: Record<string, string> | null | undefined,
  field: string,
  descriptionId?: string,
): {
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
} {
  const hasError = Boolean(errors?.[field]);
  if (!hasError && !descriptionId) return {};
  const ids = [descriptionId, hasError ? `${field}-error` : undefined].filter(
    Boolean,
  ) as string[];
  return {
    "aria-invalid": hasError ? true : undefined,
    "aria-describedby": ids.length > 0 ? ids.join(" ") : undefined,
  };
}

/**
 * Tiny `useState` wrapper that resets an error field when the user edits
 * that field. Returns the field's current error string (or `undefined`).
 */
export function useFieldErrorReset(
  initial: Record<string, string> | null = null,
): {
  errors: Record<string, string> | null;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string> | null>>;
  clearField: (field: string) => void;
  reset: () => void;
} {
  const [errors, setErrors] = React.useState<Record<string, string> | null>(initial);
  const clearField = React.useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev || prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return Object.keys(next).length === 0 ? null : next;
    });
  }, []);
  const reset = React.useCallback(() => setErrors(null), []);
  return { errors, setErrors, clearField, reset };
}
