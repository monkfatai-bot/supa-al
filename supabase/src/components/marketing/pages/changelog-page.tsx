"use client";

/**
 * Supa AI — Changelog page.
 *
 * Fetches the published changelog entries from `/api/marketing/changelog`
 * and renders them as a vertical timeline. Each entry shows the version,
 * title, summary, category badge, and published date.
 *
 * @module @/components/marketing/pages/changelog-page
 */
import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Sparkles } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/index";
import { PageHeader } from "../sections/page-header";
import type { ApiResponse } from "@/types/api";

interface ChangelogEntrySummary {
  id: string;
  slug: string;
  title: string;
  version: string | null;
  summary: string | null;
  content: string;
  category: string;
  published_at: string;
  is_featured: boolean;
}

const CATEGORY_BADGES: Record<string, string> = {
  release: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  feature: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  improvement: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  bugfix: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  security: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  deprecation: "bg-muted text-muted-foreground",
};

export function ChangelogPage() {
  const [entries, setEntries] = React.useState<ChangelogEntrySummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/changelog?limit=30", { cache: "no-store" });
        const json = (await res.json()) as ApiResponse<ChangelogEntrySummary[]>;
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.success === false ? json.error.message : "Failed to load changelog.");
          setEntries([]);
          return;
        }
        setEntries(json.data);
      } catch {
        if (cancelled) return;
        setError("Network error.");
        setEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Changelog"
        title="What's new"
        subtitle="Releases, features, improvements, bugfixes, and security updates — all in one place."
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {entries === null ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="mt-2 h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={error ? "Could not load changelog" : "No entries yet"}
            description={error ?? "Check back soon for release notes."}
          />
        ) : (
          <ol className="relative space-y-6 border-l border-emerald-200 pl-6 dark:border-emerald-900">
            {entries.map((entry) => (
              <li key={entry.id} className="relative">
                {/* Timeline dot */}
                <span className="absolute -left-[1.65rem] top-6 size-3 rounded-full bg-emerald-500 ring-4 ring-background" />
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className={CATEGORY_BADGES[entry.category] ?? "bg-muted text-muted-foreground"}>
                        {entry.category}
                      </Badge>
                      {entry.version ? (
                        <Badge variant="outline">v{entry.version}</Badge>
                      ) : null}
                      {entry.is_featured ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Featured</Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(entry.published_at)}
                      </span>
                    </div>
                    <CardTitle className="mt-2 text-lg">{entry.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {entry.summary ? (
                      <p className="text-sm text-muted-foreground">{entry.summary}</p>
                    ) : null}
                    <pre className="mt-3 overflow-x-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-foreground">
                      {entry.content}
                    </pre>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
