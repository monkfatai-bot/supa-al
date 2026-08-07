"use client";

/**
 * Supa AI — auth layout.
 *
 * Centered, responsive layout for all auth screens. On desktop: a two-column
 * split with a brand panel on the left (logo, tagline, feature highlights,
 * emerald gradient) and the auth form on the right, vertically centered. On
 * mobile: a single column with a small logo at the top and the form card
 * below.
 *
 * The layout itself is presentational — it doesn't own auth state. The
 * parent `<AuthFlow>` decides which form to render and passes it as
 * `children`. The optional `banner` slot (above the form card) is used for
 * the `<SupabaseConfigNotice>` when Supabase isn't configured.
 *
 * Accessibility:
 *   - `<main>` landmark wraps the form so screen readers can jump straight
 *     to it.
 *   - The brand panel is `aria-hidden` on mobile (it's hidden visually, so
 *     it shouldn't be in the a11y tree either).
 *   - The footer is `mt-auto` so it sticks to the viewport bottom on short
 *     content and gets pushed down naturally on long content.
 *
 * @module @/components/auth/auth-layout
 */
import * as React from "react";
import { Sparkles, ShieldCheck, Zap, Lock } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants/app";

export interface AuthLayoutProps {
  /** The auth form card (login / register / forgot / etc.). */
  children: React.ReactNode;
  /** Optional banner slot above the form (used for the SupabaseConfigNotice). */
  banner?: React.ReactNode;
}

const HIGHLIGHTS: readonly { icon: React.ElementType; title: string; body: string }[] = [
  {
    icon: Sparkles,
    title: "7 AI providers, one workspace",
    body: "Chat with OpenAI, Anthropic, Google, and more — switch models mid-conversation.",
  },
  {
    icon: Zap,
    title: "Built for production",
    body: "Streaming, tool calling, usage tracking, rate limiting, and audit logs out of the box.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by default",
    body: "Row-level security, brute-force protection, PKCE OAuth, and GDPR-ready data exports.",
  },
  {
    icon: Lock,
    title: "Your data stays yours",
    body: "Self-host on Supabase. No third-party telemetry. Delete your account anytime.",
  },
];

export function AuthLayout({ children, banner }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Mobile top bar — just the logo. */}
      <header className="flex items-center justify-between px-4 py-4 md:hidden">
        <Logo size={28} withWordmark />
      </header>

      <div className="flex flex-1 items-stretch">
        {/* Brand panel — desktop only. */}
        <aside
          aria-hidden="true"
          className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand p-10 text-brand-foreground lg:flex xl:w-3/5"
        >
          {/* Decorative gradient + grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 20% 0%, oklch(0.85 0.15 162.48 / 0.45), transparent 60%), radial-gradient(ellipse 60% 80% at 100% 100%, oklch(0.55 0.14 178 / 0.35), transparent 70%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to right, oklch(0.99 0 0 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.99 0 0 / 0.08) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          <div className="relative z-10">
            <Logo size={36} withWordmark className="[&_span]:text-brand-foreground" />
          </div>

          <div className="relative z-10 max-w-md">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
              {APP_DESCRIPTION}
            </h1>
            <p className="mt-3 text-sm text-brand-foreground/80">
              The enterprise-grade AI SaaS starter — production-ready auth,
              billing, and a multi-provider AI layer in one workspace.
            </p>

            <ul className="mt-8 grid gap-4">
              {HIGHLIGHTS.map((h) => {
                const Icon = h.icon;
                return (
                  <li key={h.title} className="flex gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-foreground/15">
                      <Icon className="size-4 text-brand-foreground" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-brand-foreground">{h.title}</p>
                      <p className="text-xs text-brand-foreground/75">{h.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="relative z-10 text-xs text-brand-foreground/70">
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </div>
        </aside>

        {/* Form panel */}
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6">
          <div className="flex w-full max-w-sm flex-col gap-4">
            {banner}
            <div className="flex justify-center">{children}</div>
          </div>
        </main>
      </div>

      {/* Mobile footer — sticky via mt-auto on the outer flex-col wrapper. */}
      <footer className="mt-auto px-4 py-4 text-center text-xs text-muted-foreground md:hidden">
        © {new Date().getFullYear()} {APP_NAME}
      </footer>
    </div>
  );
}
