"use client";

/**
 * Supa AI — Integrations page.
 *
 * Searchable + filterable grid of the integrations catalog (defined in
 * `marketing-data.ts`). Filters by search text and category.
 *
 * @module @/components/marketing/pages/integrations-page
 */
import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../sections/page-header";
import { INTEGRATIONS, type IntegrationEntry } from "../marketing-data";

const AUTH_BADGE_CLASSES: Record<IntegrationEntry["authType"], string> = {
  oauth2: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  api_key: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  basic: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  webhook: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  none: "bg-muted text-muted-foreground",
};

export function IntegrationsPage() {
  const [query, setQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const integration of INTEGRATIONS) set.add(integration.category);
    return Array.from(set).sort();
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return INTEGRATIONS.filter((integration) => {
      const matchesQuery =
        !q ||
        integration.name.toLowerCase().includes(q) ||
        integration.description.toLowerCase().includes(q);
      const matchesCategory =
        !activeCategory || integration.category === activeCategory;
      return matchesQuery && matchesCategory;
    });
  }, [query, activeCategory]);

  return (
    <>
      <PageHeader
        eyebrow="Integrations"
        title="Connect 100+ apps without code"
        subtitle="OAuth2, API-key, basic, and webhook-based integrations with bi-directional sync. Monitor webhooks, run sync jobs, and trigger workflows on incoming events."
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Search + filters */}
        <div className="flex flex-col gap-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search integrations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(null)}
              className={activeCategory === null ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}
            >
              All
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={activeCategory === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory(cat)}
                className={activeCategory === cat ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((integration) => (
            <Card key={integration.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{integration.name}</CardTitle>
                  {integration.popular ? (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Popular</Badge>
                  ) : null}
                </div>
                <Badge variant="secondary" className={AUTH_BADGE_CLASSES[integration.authType]}>
                  {integration.authType}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{integration.description}</p>
                <p className="mt-2 text-xs text-muted-foreground/70">{integration.category}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="mt-12 text-center text-sm text-muted-foreground">
            No integrations match your search. Try a different query.
          </p>
        ) : null}
      </section>
    </>
  );
}
