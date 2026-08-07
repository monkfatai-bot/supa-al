"use client";

/**
 * Supa AI — Testimonials section.
 *
 * Responsive grid of customer testimonials. Each card shows the quote, the
 * customer's initials in an emerald avatar, name, role, and company.
 *
 * @module @/components/marketing/sections/testimonials
 */
import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { TESTIMONIALS } from "../marketing-data";

export function TestimonialsSection() {
  return (
    <section
      className="bg-muted/30 py-20"
      aria-labelledby="testimonials-headline"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
            Customer love
          </p>
          <h2
            id="testimonials-headline"
            className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            Teams ship faster on Supa AI
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} className="bg-background">
              <CardContent className="flex h-full flex-col gap-4">
                <p className="text-sm leading-relaxed text-foreground">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-auto flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    {t.initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.role} · {t.company}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
