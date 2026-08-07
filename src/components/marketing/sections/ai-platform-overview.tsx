"use client";

/**
 * Supa AI — AI Platform Overview section.
 *
 * Renders the 6 product cards (Chat, Images, Voice, Video, Employees,
 * Workflows) in a responsive grid. Each card has a branded icon, title,
 * tagline, description, feature list, and a "Learn more" CTA.
 *
 * @module @/components/marketing/sections/ai-platform-overview
 */
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MARKETING_PRODUCTS, type MarketingViewId } from "../marketing-data";

export interface AiPlatformOverviewProps {
  onNavigate?: (view: MarketingViewId) => void;
}

export function AiPlatformOverview({ onNavigate }: AiPlatformOverviewProps) {
  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="platform-overview-headline"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
          One platform, every workflow
        </p>
        <h2
          id="platform-overview-headline"
          className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          The AI platform your team will actually use
        </h2>
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">
          Six tightly-integrated products that share auth, billing, storage,
          and audit logs. Stop stitching together SaaS subscriptions — start
          shipping in one workspace.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {MARKETING_PRODUCTS.map((product) => {
          const Icon = product.icon;
          return (
            <Card
              key={product.id}
              className="group relative flex flex-col transition-all hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-900"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Icon className="size-5" />
                  </span>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    {product.tagline}
                  </Badge>
                </div>
                <CardTitle className="mt-3 text-xl">{product.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-sm text-muted-foreground">{product.description}</p>
                <ul className="mt-1 grid grid-cols-2 gap-1.5">
                  {product.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={product.href}
                  onClick={() => onNavigate?.(product.view)}
                  className="mt-auto inline-flex items-center text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700"
                >
                  Learn more
                  <ArrowRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
