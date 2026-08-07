"use client";

/**
 * Supa AI — Product Showcase section.
 *
 * Tabbed showcase of the 5 product pillars (AI Employees, Workflow Builder,
 * Business AI, Integration Hub, Marketplace). Each tab shows a title,
 * description, and a bulleted feature list. Renders above the fold on the
 * products page and on the home page.
 *
 * @module @/components/marketing/sections/product-showcase
 */
import * as React from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Check } from "lucide-react";
import { SHOWCASE_TABS } from "../marketing-data";

export function ProductShowcase() {
  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="showcase-headline"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
          Built for every workflow
        </p>
        <h2
          id="showcase-headline"
          className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          Five products. One platform.
        </h2>
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">
          Each pillar is fully built and production-ready. Click a tab to see
          what's inside.
        </p>
      </div>

      <Tabs defaultValue={SHOWCASE_TABS[0]!.id} className="mt-10">
        <TabsList className="mx-auto flex w-full max-w-3xl flex-wrap justify-center gap-1">
          {SHOWCASE_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SHOWCASE_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <div className="mx-auto mt-8 max-w-4xl rounded-xl border border-border bg-card p-6 sm:p-8 lg:p-10">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {tab.title}
              </h3>
              <p className="mt-2 text-base text-muted-foreground">
                {tab.description}
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {tab.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <Check className="size-3" />
                    </span>
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
