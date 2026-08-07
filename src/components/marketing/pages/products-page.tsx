"use client";

/**
 * Supa AI — Products page.
 *
 * Reuses the platform overview + product showcase sections under a compact
 * page header. Adds a final CTA strip.
 *
 * @module @/components/marketing/pages/products-page
 */
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "../sections/page-header";
import { AiPlatformOverview } from "../sections/ai-platform-overview";
import { ProductShowcase } from "../sections/product-showcase";
import { FeatureComparisonSection } from "../sections/feature-comparison";
import type { MarketingViewId } from "../marketing-data";

export interface ProductsPageProps {
  onNavigate?: (view: MarketingViewId) => void;
}

export function ProductsPage({ onNavigate }: ProductsPageProps) {
  return (
    <>
      <PageHeader
        eyebrow="Products"
        title="The AI platform your team will actually use"
        subtitle="Six tightly-integrated products that share auth, billing, storage, and audit logs. Stop stitching together SaaS subscriptions — start shipping in one workspace."
      />
      <AiPlatformOverview onNavigate={onNavigate} />
      <ProductShowcase />
      <FeatureComparisonSection />

      {/* CTA strip */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Ready to try every product?
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Start free. Bring your own AI provider keys. Upgrade when you ship to production.
          </p>
          <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Link href="/?signup=1">
              Start free
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
