"use client";

/**
 * Supa AI — Pricing section (5 tiers).
 *
 * Renders 5 pricing tier cards in a responsive grid. The "Pro" tier is
 * highlighted with an emerald ring + "Most popular" badge. Enterprise uses
 * the "Custom" pricing label and routes to the contact page.
 *
 * @module @/components/marketing/sections/pricing
 */
import * as React from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRICING_TIERS, type MarketingViewId } from "../marketing-data";

export interface PricingSectionProps {
  onNavigate?: (view: MarketingViewId) => void;
}

export function PricingSection({ onNavigate }: PricingSectionProps) {
  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="pricing-headline"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
          Simple, transparent pricing
        </p>
        <h2
          id="pricing-headline"
          className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          Pricing that scales with you
        </h2>
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">
          Start free. Upgrade when you're ready. Cancel anytime. Annual plans
          save ~2 months.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        {PRICING_TIERS.map((tier) => (
          <Card
            key={tier.id}
            className={cn(
              "relative flex flex-col",
              tier.highlighted &&
                "border-emerald-300 ring-2 ring-emerald-500/30 dark:border-emerald-900",
            )}
          >
            {tier.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  <Sparkles className="mr-1 size-3" />
                  Most popular
                </Badge>
              </div>
            )}
            <CardHeader>
              <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
              <p className="text-xs text-muted-foreground">{tier.tagline}</p>
              <div className="mt-4">
                {tier.custom ? (
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    Custom
                  </p>
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    ${tier.monthly}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                )}
                {!tier.custom && tier.yearly > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    or ${tier.yearly}/year
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <ul className="flex-1 space-y-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={tier.highlighted ? "default" : "outline"}
                className={cn(
                  tier.highlighted &&
                    "bg-emerald-600 text-white hover:bg-emerald-700",
                )}
              >
                <Link
                  href={tier.href}
                  onClick={() => onNavigate?.(tier.href.includes("view=contact") ? "contact" : "pricing")}
                >
                  {tier.cta}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
