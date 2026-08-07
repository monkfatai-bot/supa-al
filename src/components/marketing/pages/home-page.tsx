"use client";

/**
 * Supa AI — Marketing home page.
 *
 * Assembles the full-length marketing landing page from the hero,
 * trusted-by, platform overview, product showcase, stats, testimonials,
 * feature comparison, FAQ, pricing, and newsletter sections.
 *
 * @module @/components/marketing/pages/home-page
 */
import * as React from "react";

import { HeroSection } from "../sections/hero";
import { TrustedBySection } from "../sections/trusted-by";
import { AiPlatformOverview } from "../sections/ai-platform-overview";
import { ProductShowcase } from "../sections/product-showcase";
import { StatsSection } from "../sections/stats";
import { TestimonialsSection } from "../sections/testimonials";
import { FeatureComparisonSection } from "../sections/feature-comparison";
import { FaqSection } from "../sections/faq";
import { PricingSection } from "../sections/pricing";
import { NewsletterSection } from "../sections/newsletter";
import { TRUST_PILLARS, type MarketingViewId } from "../marketing-data";

import { ShieldCheck, Zap, Lock, Globe } from "lucide-react";

export interface HomePageProps {
  onNavigate?: (view: MarketingViewId) => void;
}

const PILLAR_ICONS = [ShieldCheck, Zap, Lock, Globe] as const;

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <>
      <HeroSection />
      <TrustedBySection />

      {/* Trust pillars — 4-up row */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-label="Why Supa AI">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_PILLARS.map((pillar, idx) => {
            const Icon = PILLAR_ICONS[idx] ?? ShieldCheck;
            return (
              <div key={pillar.title} className="flex flex-col gap-2">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-2 text-base font-semibold text-foreground">{pillar.title}</h3>
                <p className="text-sm text-muted-foreground">{pillar.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <AiPlatformOverview onNavigate={onNavigate} />
      <ProductShowcase />
      <StatsSection />
      <TestimonialsSection />
      <FeatureComparisonSection />
      <PricingSection onNavigate={onNavigate} />
      <FaqSection />
      <NewsletterSection />
    </>
  );
}
