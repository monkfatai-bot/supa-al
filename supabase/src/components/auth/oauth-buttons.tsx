"use client";

/**
 * Supa AI — OAuth sign-in buttons.
 *
 * Renders one button per supported provider (Google, GitHub, Microsoft,
 * Apple). Each button POSTs to `/api/auth/oauth/signin` with the provider
 * id (+ optional `redirectTo`), receives `{url}`, and navigates the browser
 * to that URL — which kicks off the PKCE OAuth flow that ends back at
 * `/api/auth/callback?code=...`.
 *
 * Brand icons are inline SVGs (no external icon libraries) so the bundle
 * stays slim and we don't ship a brand-logo dependency for just four marks.
 * The Apple logo is the official "Apple Logo" glyph (single-color, fills to
 * `currentColor`); Google is the official 4-color mark; GitHub + Microsoft
 * are monochrome marks that fill to `currentColor`.
 *
 * The buttons share a consistent outline style — they're alternatives to
 * the email/password form, not the primary CTA, so they shouldn't compete
 * visually with the brand-colored "Sign in" / "Create account" submit.
 *
 * @module @/components/auth/oauth-buttons
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOAuthSignIn, type AuthApiError } from "@/hooks/use-auth";
import type { OauthProvider } from "@/lib/validation/auth";

export interface OAuthButtonsProps {
  /**
   * Optional path the user should land on after a successful callback.
   * Must be a same-origin relative path (e.g. `/`). The server validates
   * this — an absolute URL or `//`-prefixed value is rejected.
   */
  redirectTo?: string;
  /** Optional className on the wrapping `<div>`. */
  className?: string;
  /**
   * Called when an OAuth request fails — lets the parent screen surface
   * the error in its `AuthErrorAlert` alongside form errors.
   */
  onError?: (error: AuthApiError) => void;
}

interface ProviderConfig {
  id: OauthProvider;
  label: string;
  /** Inline SVG brand mark. `className` is applied to the `<svg>`. */
  icon: (props: { className?: string }) => React.ReactElement;
}

// ---------------------------------------------------------------------------
// Brand marks (inline SVG, single path each).
// ---------------------------------------------------------------------------

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.21-3.37-1.21-.46-1.17-1.11-1.48-1.11-1.48-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.36 9.36 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="8" height="8" fill="#F25022" />
      <rect x="13" y="3" width="8" height="8" fill="#7FBA00" />
      <rect x="3" y="13" width="8" height="8" fill="#00A4EF" />
      <rect x="13" y="13" width="8" height="8" fill="#FFB900" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M16.365 1.43c0 1.14-.467 2.213-1.235 2.99-.78.79-1.83 1.31-2.99 1.31-.03 0-.06 0-.09-.01-.02-1.13.45-2.18 1.21-2.95.78-.78 1.86-1.32 3.07-1.34.01 0 .02.01.03.01.005 0 .01-.005.015-.01Zm3.41 17.06c-.43 1.02-.95 2.04-1.57 3.06-.86 1.41-1.74 2.27-2.62 2.31-.66.03-1.46-.31-2.39-1-.04-.03-.08-.06-.13-.09-.97-.71-1.94-1.06-2.91-1.06-.97 0-1.94.35-2.91 1.06-.05.03-.09.06-.13.09-.93.69-1.73 1.03-2.39 1-.88-.04-1.76-.9-2.62-2.31-.62-1.02-1.14-2.04-1.57-3.06-1.43-3.41-.78-7.71 2.13-9.06.86-.4 1.78-.41 2.74-.04.79.31 1.55.81 2.27 1.5.06.05.13.07.21.07.08 0 .15-.02.21-.07.72-.69 1.48-1.19 2.27-1.5.96-.37 1.88-.36 2.74.04 2.91 1.35 3.56 5.65 2.13 9.06Z" />
    </svg>
  );
}

const PROVIDERS: readonly ProviderConfig[] = [
  { id: "google", label: "Google", icon: GoogleIcon },
  { id: "github", label: "GitHub", icon: GithubIcon },
  { id: "microsoft", label: "Microsoft", icon: MicrosoftIcon },
  { id: "apple", label: "Apple", icon: AppleIcon },
];

export function OAuthButtons({ redirectTo, className, onError }: OAuthButtonsProps) {
  const oauth = useOAuthSignIn();

  const handleClick = React.useCallback(
    (provider: OauthProvider) => {
      oauth.mutate(
        { provider, redirectTo },
        {
          onSuccess: (data) => {
            // Navigate the browser to the provider's authorization URL.
            // This is a full page navigation — the SPA is unmounted.
            if (typeof window !== "undefined" && data.url) {
              window.location.href = data.url;
            }
          },
          onError: (err) => {
            onError?.(err);
          },
        },
      );
    },
    [oauth, redirectTo, onError],
  );

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-4",
        oauth.isPending && "pointer-events-none opacity-60",
        className,
      )}
      role="group"
      aria-label="Sign in with a social provider"
    >
      {PROVIDERS.map((p) => {
        const Icon = p.icon;
        const isPending = oauth.isPending && oauth.variables?.provider === p.id;
        return (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            size="lg"
            aria-label={`Continue with ${p.label}`}
            className={cn(
              "h-11 w-full gap-2 bg-background",
              // Apple's logo is filled to currentColor — invert on dark backgrounds for contrast.
              p.id === "apple" && "dark:text-foreground",
            )}
            onClick={() => handleClick(p.id)}
            disabled={oauth.isPending}
          >
            <Icon className="shrink-0" />
            <span className="sr-only sm:not-sr-only sm:text-sm">{p.label}</span>
            {isPending ? (
              <span className="sr-only" role="status">
                Redirecting to {p.label}…
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
