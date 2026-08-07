"use client";

/**
 * Supa AI — Image view (Phase 4 top-level container).
 *
 * The dashboard section rendered for `'image'` by the
 * `SectionRouter`. Composes four tabs:
 *
 *   - **Generate** — prompt + model picker + style picker + size picker
 *     + generate button + result preview.
 *   - **Gallery** — responsive grid of past generations with a
 *     click-to-view lightbox.
 *   - **Models** — list of available image models grouped by provider.
 *   - **Usage** — aggregated usage stats (images generated, credits
 *     used, by-provider breakdown).
 *
 * @module @/components/image/image-view
 */
import * as React from "react";
import { Images, LayoutDashboard, Sparkles, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { useImageModels, useImageUsage } from "@/hooks/use-images";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ImageGallery } from "./image-gallery";
import { ImageStudio } from "./image-studio";

/** The dashboard section component. Drop-in for the `'image'` section. */
export function ImageView() {
  return (
    <Tabs defaultValue="generate" className="flex h-full flex-col gap-0">
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="px-4 py-2">
          <TabsList>
            <TabsTrigger value="generate" className="gap-2">
              <Sparkles className="size-4" aria-hidden="true" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="gallery" className="gap-2">
              <Images className="size-4" aria-hidden="true" />
              Gallery
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2">
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Models
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2">
              <Wallet className="size-4" aria-hidden="true" />
              Usage
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <TabsContent value="generate" className="mt-0">
          <ImageStudio />
        </TabsContent>
        <TabsContent value="gallery" className="mt-0">
          <ImageGallery />
        </TabsContent>
        <TabsContent value="models" className="mt-0">
          <ModelsTab />
        </TabsContent>
        <TabsContent value="usage" className="mt-0">
          <UsageTab />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Models tab
// ---------------------------------------------------------------------------

function ModelsTab() {
  const query = useImageModels();
  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }
  const models = query.data ?? [];
  if (models.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No image models configured</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add an API key for at least one image provider (OpenAI,
            Stability, Replicate, Fal, Ideogram, or Google) to enable
            image generation.
          </p>
        </CardContent>
      </Card>
    );
  }
  // Group by provider.
  const grouped = new Map<string, typeof models>();
  for (const m of models) {
    const arr = grouped.get(m.provider) ?? [];
    arr.push(m);
    grouped.set(m.provider, arr);
  }
  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([provider, items]) => (
        <Card key={provider}>
          <CardHeader>
            <CardTitle className="text-sm capitalize">{provider}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {items.map((m) => (
                <li key={`${m.provider}:${m.model_id}`} className="rounded-md border p-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {m.model_id}
                    </p>
                  </div>
                  {m.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                    {m.max_size ? <span>Max: {m.max_size}</span> : null}
                    {m.is_active ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage tab
// ---------------------------------------------------------------------------

function UsageTab() {
  const query = useImageUsage();
  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }
  const usage = query.data;
  if (!usage || usage.totalImages === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No usage yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once you generate images, your usage stats will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total images</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{usage.totalImages}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Credits used</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{usage.totalCredits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Period</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {usage.period.start} → {usage.period.end}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">By provider</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {Object.entries(usage.byProvider).map(([p, v]) => (
              <li
                key={p}
                className={cn(
                  "flex items-center justify-between rounded-md border p-3",
                )}
              >
                <span className="text-sm font-medium capitalize">{p}</span>
                <span className="text-xs text-muted-foreground">
                  {v.images} images · {v.credits} credits
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
