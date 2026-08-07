"use client";

/**
 * Supa AI — Docs page.
 *
 * Fetches the published documentation pages from `/api/marketing/docs`
 * and renders them grouped by category in a sidebar + content layout.
 *
 * @module @/components/marketing/pages/docs-page
 */
import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../sections/page-header";
import { groupBy } from "@/lib/utils/index";
import type { ApiResponse } from "@/types/api";

interface DocSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  section: string | null;
  version: string;
}

export function DocsPage() {
  const [docs, setDocs] = React.useState<DocSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [activeSlug, setActiveSlug] = React.useState<string | null>(null);
  const [activeContent, setActiveContent] = React.useState<string>("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/docs?limit=100", { cache: "no-store" });
        const json = (await res.json()) as ApiResponse<DocSummary[]>;
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.success === false ? json.error.message : "Failed to load docs.");
          setDocs([]);
          return;
        }
        setDocs(json.data);
        if (json.data.length > 0) setActiveSlug(json.data[0]!.slug);
      } catch {
        if (cancelled) return;
        setError("Network error.");
        setDocs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch active doc content whenever the active slug changes.
  React.useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/marketing/docs/${activeSlug}`, { cache: "no-store" });
        const json = (await res.json()) as ApiResponse<{ content: string }>;
        if (cancelled) return;
        if (res.ok && json.success) {
          setActiveContent(json.data.content);
        }
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  const grouped = React.useMemo(() => {
    if (!docs) return null;
    return groupBy(docs, (d) => d.category);
  }, [docs]);

  return (
    <>
      <PageHeader
        eyebrow="Documentation"
        title="Build with Supa AI"
        subtitle="Guides, API references, and recipes for shipping on Supa AI."
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {docs === null ? (
          <div className="grid gap-6 md:grid-cols-[260px_1fr]">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={error ? "Could not load docs" : "No docs published yet"}
            description={error ?? "Check back soon for guides and references."}
          />
        ) : (
          <div className="grid gap-8 md:grid-cols-[260px_1fr]">
            {/* Sidebar */}
            <aside aria-label="Documentation navigation">
              {grouped ? (
                <nav className="sticky top-20 space-y-6">
                  {Object.entries(grouped).map(([category, items]) => (
                    <div key={category}>
                      <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {category}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {items.map((doc) => (
                          <li key={doc.id}>
                            <button
                              type="button"
                              onClick={() => setActiveSlug(doc.slug)}
                              className={
                                "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                                (activeSlug === doc.slug
                                  ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
                              }
                            >
                              {doc.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
              ) : null}
            </aside>

            {/* Content */}
            <article className="min-w-0">
              {docs.find((d) => d.slug === activeSlug) ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-2xl">
                        {docs.find((d) => d.slug === activeSlug)!.title}
                      </CardTitle>
                      <Badge variant="secondary">
                        v{docs.find((d) => d.slug === activeSlug)!.version}
                      </Badge>
                    </div>
                    {docs.find((d) => d.slug === activeSlug)?.description ? (
                      <p className="text-sm text-muted-foreground">
                        {docs.find((d) => d.slug === activeSlug)!.description}
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    <pre className="overflow-x-auto rounded-md bg-muted/50 p-4 text-xs leading-relaxed text-foreground">
                      {activeContent || "Loading…"}
                    </pre>
                  </CardContent>
                </Card>
              ) : (
                <EmptyState icon={BookOpen} title="Pick a doc" description="Select a page from the sidebar." />
              )}
            </article>
          </div>
        )}
      </section>
    </>
  );
}
