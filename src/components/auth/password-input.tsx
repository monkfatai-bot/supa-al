"use client";

/**
 * Supa AI — password input.
 *
 * An `<input type="password">` with an Eye/EyeOff show/hide toggle. Used by
 * every auth screen that collects a password (login, register,
 * reset-password). Extracted as a small shared primitive so the show/hide
 * state stays consistent across forms.
 *
 * Accessibility:
 *   - The toggle button has `aria-label` + `aria-pressed`.
 *   - The input switches its `type` between `password` and `text`.
 *   - The label is associated via `htmlFor` (passed through `id`).
 *
 * @module @/components/auth/password-input
 */
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PasswordInputProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  /** Optional extra className on the wrapping `<div>`. */
  containerClassName?: string;
}

export function PasswordInput({
  className,
  containerClassName,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);
  const id = React.useId();

  return (
    <div className={cn("relative", containerClassName)}>
      <Input
        type={visible ? "text" : "password"}
        className={cn("h-11 pr-11", className)}
        // Re-key the toggle so screen readers announce the new state.
        data-password-visible={visible ? "true" : "false"}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id ?? undefined}
        id={id}
        className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
        tabIndex={0}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
