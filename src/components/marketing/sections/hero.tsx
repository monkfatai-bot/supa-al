"use client";

/**
 * Supa AI — Marketing hero section.
 *
 * Full-bleed emerald gradient with the headline, sub-headline, primary +
 * secondary CTAs, and a row of inline stats. Rendered at the top of the
 * home page.
 *
 * @module @/components/marketing/sections/hero
 */
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HERO_HEADLINE,
  HERO_PRIMARY_CTA,
  HERO_PRIMARY_HREF,
  HERO_SECONDARY_CTA,
  HERO_SECONDARY_HREF,
  HERO_SUBHEADLINE,
  MARKETING_STATS,
} from "../marketing-data";

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-background"
      aria-labelledby="hero-headline"
    >
      {/* Emerald gradient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.85 0.15 162.48 / 0.40), transparent 60%), radial-gradient(ellipse 60% 80% at 100% 100%, oklch(0.55 0.14 178 / 0.20), transparent 70%)",
        }}
      />
      {/* Grid pattern overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.5 0 0 / 0.18) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.5 0 0 / 0.18) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center gap-8 px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
        {/* Announcement pill */}
        <Link
          href="/?view=changelog"
          className="group inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          <Sparkles className="size-3.5" />
          <span>Phase 11: Marketing Platform is live</span>
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <h1
          id="hero-headline"
          className={cn(
            "max-w-4xl text-center text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl",
            "bg-gradient-to-br from-foreground via-foreground to-emerald-700 bg-clip-text text-transparent",
          )}
        >
          {HERO_HEADLINE}
        </h1>

        <p className="max-w-2xl text-center text-base text-muted-foreground sm:text-lg lg:text-xl">
          {HERO_SUBHEADLINE}
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Link href={HERO_PRIMARY_HREF}>
              {HERO_PRIMARY_CTA}
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={HERO_SECONDARY_HREF}>{HERO_SECONDARY_CTA}</Link>
          </Button>
        </div>

        {/* Stats row */}
        <dl className="mt-8 grid w-full max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
          {MARKETING_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <dt className="text-2xl font-bold text-emerald-600 sm:text-3xl">
                {stat.prefix}
                {stat.value.toLocaleString()}
                {stat.suffix}
              </dt>
              <dd className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
