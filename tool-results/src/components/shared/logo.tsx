import * as React from "react";

import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants/app";

/**
 * Supa AI — Brand logo mark.
 *
 * A self-contained inline SVG (no external image / fetch). The mark is a
 * rounded square with a soft emerald gradient and a stylized "S" spark in
 * the foreground. Designed to look crisp at 16px (favicon) through 64px
 * (sidebar) without a separate asset pipeline.
 *
 * The wordmark (when `withWordmark` is set) renders the product name in the
 * sans font with tight tracking, paired with the mark via a small gap.
 *
 * @module @/components/shared/logo
 */
export interface LogoProps {
  /** Square edge length in pixels. Defaults to 32. */
  size?: number;
  /** Extra class names on the outer wrapper. */
  className?: string;
  /** When `true`, render the "Supa AI" wordmark to the right of the mark. */
  withWordmark?: boolean;
}

export function Logo({ size = 32, className, withWordmark = false }: LogoProps) {
  const id = React.useId();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 select-none",
        className,
      )}
      aria-label={APP_NAME}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={`logo-grad-${id}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="oklch(0.78 0.17 162.48)" />
            <stop offset="100%" stopColor="oklch(0.55 0.14 178)" />
          </linearGradient>
        </defs>
        {/* Rounded-square plate */}
        <rect x="2" y="2" width="44" height="44" rx="12" fill={`url(#logo-grad-${id})`} />
        {/* Inner subtle ring */}
        <rect x="2.75" y="2.75" width="42.5" height="42.5" rx="11.25" fill="none" stroke="oklch(0.985 0 0 / 0.18)" strokeWidth="1.25" />
        {/* Stylized "S" spark */}
        <path
          d="M31.5 16.5c-1.6-2-4-3.2-7-3.2-4.4 0-7.5 2.6-7.5 6 0 3 2.2 4.7 6.4 5.6 3.7.8 5.2 1.6 5.2 3.2 0 1.5-1.5 2.5-3.9 2.5-2.2 0-4-.8-5.3-2.4l-3 2.4c1.7 2.4 4.6 3.7 8.2 3.7 4.7 0 8-2.5 8-6.3 0-3.1-2.1-4.8-6.5-5.7-3.6-.8-5.1-1.5-5.1-3 0-1.3 1.3-2.2 3.4-2.2 1.9 0 3.5.7 4.7 2.1l2.4-2.7z"
          fill="oklch(0.99 0 0)"
        />
        {/* Spark accent dot */}
        <circle cx="34" cy="14" r="2.2" fill="oklch(0.99 0.99 0 0)" opacity="0.9" />
      </svg>
      {withWordmark ? (
        <span className="text-base font-semibold tracking-tight leading-none">
          {APP_NAME}
        </span>
      ) : null}
    </span>
  );
}
