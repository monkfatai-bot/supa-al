"use client";

/**
 * Supa AI — Pricing page.
 *
 * Page header + pricing section + feature comparison + FAQ.
 *
 * @module @/components/marketing/pages/pricing-page
 */
import * as React from "react";

import { PageHeader } from "../sections/page-header";
import { PricingSection } from "../sections/pricing";
import { FeatureComparisonSection } from "../sections/feature-comparison";
import { FaqSection } from "../sections/faq";
import type { MarketingViewId } from "../marketing-data";

export interface PricingPageProps {
  onNavigate?: (view: MarketingViewId) => void;
}

export function PricingPage({ onNavigate }: PricingPageProps) {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Simple, transparent pricing"
        subtitle="Start free. Upgrade when you're ready. Cancel anytime. Annual plans save ~2 months."
      />
      <PricingSection onNavigate={onNavigate} />
      <FeatureComparisonSection />
      <FaqSection />
    </>
  );
}
