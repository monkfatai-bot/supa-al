"use client";

/**
 * Supa AI — Blog page.
 *
 * Fetches the published blog posts from `/api/marketing/blog` and renders
 * them as a responsive grid. Shows skeleton placeholders while loading
 * and an empty state when no posts are returned.
 *
 * @module @/components/marketing/pages/blog-page
 */
import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { FileText } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/index";
import { PageHeader } from "../sections/page-header";
import type { ApiResponse } from "@/types/api";

interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
  reading_time_min: number | null;
  is_featured: boolean;
  category: { slug: string; name: string } | null;
}

export function BlogPage() {
  const [posts, setPosts] = React.useState<BlogPostSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/blog?limit=20", { cache: "no-store" });
        const json = (await res.json()) as ApiResponse<BlogPostSummary[]>;
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.success === false ? json.error.message : "Failed to load blog posts.");
          setPosts([]);
          return;
        }
        setPosts(json.data);
      } catch {
        if (cancelled) return;
        setError("Network error.");
        setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Blog"
        title="Insights, releases, and stories"
        subtitle="Product announcements, engineering deep dives, tutorials, and AI research."
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {posts === null ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
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
        ) : posts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={error ? "Could not load posts" : "No posts yet"}
            description={error ?? "Check back soon for fresh content."}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Card key={post.id} className="flex h-full flex-col transition-all hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-900">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {post.category ? (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        {post.category.name}
                      </Badge>
                    ) : null}
                    {post.is_featured ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Featured</Badge>
                    ) : null}
                  </div>
                  <CardTitle className="mt-2 text-lg">{post.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2">
                  {post.excerpt ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>
                  ) : null}
                  <p className="mt-auto text-xs text-muted-foreground">
                    {post.published_at ? formatRelativeTime(post.published_at) : "Draft"}
                    {post.reading_time_min ? ` · ${post.reading_time_min} min read` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
