"use client";

/**
 * Supa AI — Marketplace page.
 *
 * Static overview of the marketplace concept: featured collections, how it
 * works, and a CTA. Phase 9C ships the actual marketplace CRUD; this page
 * is the public-facing marketing entry point.
 *
 * @module @/components/marketing/pages/marketplace-page
 */
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Bot, Workflow, Plug, Star, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../sections/page-header";

interface FeaturedCollection {
  icon: React.ElementType;
  title: string;
  description: string;
  count: number;
}

const COLLECTIONS: readonly FeaturedCollection[] = [
  {
    icon: Bot,
    title: "AI Employees",
    description: "Role-specialized agents for sales, support, ops, and more.",
    count: 48,
  },
  {
    icon: Workflow,
    title: "Workflow Templates",
    description: "Pre-built automations for marketing, sales, ops, and DevOps.",
    count: 124,
  },
  {
    icon: Plug,
    title: "Integration Connectors",
    description: "OAuth + API-key connectors for 100+ SaaS apps.",
    count: 36,
  },
];

const HOW_IT_WORKS: readonly { step: string; title: string; body: string }[] = [
  {
    step: "01",
    title: "Browse",
    body: "Search by category, popularity, or curated collection.",
  },
  {
    step: "02",
    title: "Install",
    body: "One click drops the template into your workspace, ready to configure.",
  },
  {
    step: "03",
    title: "Publish",
    body: "Built something useful? Publish it to the marketplace and earn.",
  },
];

export function MarketplacePage() {
  return (
    <>
      <PageHeader
        eyebrow="Marketplace"
        title="Browse, install, publish"
        subtitle="A community marketplace for AI employees, workflow templates, integration connectors, and node packs."
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {COLLECTIONS.map((collection) => {
            const Icon = collection.icon;
            return (
              <Card key={collection.title} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <Icon className="size-5" />
                    </span>
                    <Badge variant="secondary">{collection.count} listings</Badge>
                  </div>
                  <CardTitle className="mt-3 text-lg">{collection.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{collection.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="text-center">
                <p className="text-3xl font-bold text-emerald-600">{step.step}</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top-rated listings (static demo) */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Top rated</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/?signup=1">
              View all
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { name: "Sales SDR Agent", author: "Supa AI", rating: 4.9, installs: 1240, kind: "AI Employee" },
            { name: "Standup Digest", author: "Cascade", rating: 4.8, installs: 980, kind: "Workflow" },
            { name: "Stripe → HubSpot", author: "Ledgerline", rating: 4.7, installs: 640, kind: "Integration" },
            { name: "Image Upscaler", author: "Sundial", rating: 4.9, installs: 1820, kind: "AI Employee" },
          ].map((listing) => (
            <Card key={listing.name}>
              <CardContent className="flex flex-col gap-2">
                <Badge variant="secondary" className="w-fit">{listing.kind}</Badge>
                <p className="text-sm font-semibold text-foreground">{listing.name}</p>
                <p className="text-xs text-muted-foreground">by {listing.author}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="size-3 fill-emerald-500 text-emerald-500" />
                    {listing.rating}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="size-3" />
                    {listing.installs.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Built something useful?
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Publish to the marketplace and earn revenue share on every install.
          </p>
          <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Link href="/?signup=1">
              Start publishing
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
