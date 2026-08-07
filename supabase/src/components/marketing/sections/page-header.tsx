"use client";

/**
 * Supa AI — Shared interior page header.
 *
 * Compact hero used at the top of every interior marketing page (products,
 * pricing, blog, docs, etc.). Renders an eyebrow label, the page title, and
 * an optional subtitle. Centered on the page.
 *
 * @module @/components/marketing/sections/page-header
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        "border-b border-border/60 bg-gradient-to-b from-emerald-50/50 to-background dark:from-emerald-950/20",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          {eyebrow ? (
            <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
