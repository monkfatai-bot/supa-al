"use client";

/**
 * Supa AI — Trusted-by section.
 *
 * Text-only row of customer / partner names. No external logo assets are
 * required — the names render in a muted, evenly-spaced row that wraps on
 * small screens. Used between the hero and the platform overview.
 *
 * @module @/components/marketing/sections/trusted-by
 */
import * as React from "react";

import { TRUSTED_BY } from "../marketing-data";

export function TrustedBySection() {
  return (
    <section className="border-y border-border/60 bg-background py-10" aria-label="Trusted by">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Trusted by fast-moving teams worldwide
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12">
          {TRUSTED_BY.map((name) => (
            <li
              key={name}
              className="text-base font-semibold text-muted-foreground/80 transition-colors hover:text-emerald-600 sm:text-lg"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
