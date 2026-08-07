"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Download } from "lucide-react";
import { useMarketplace } from "@/hooks/use-employees";

export function MarketplaceView() {
  const { data, isLoading } = useMarketplace({});
  const entries = (data ?? []) as Record<string, unknown>[];
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">Employee Marketplace</h1>
      {isLoading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-40" />)}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <div key={e.id as string} className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">{e.title as string}</span>
              <div className="flex items-center gap-1"><Star className="size-3 text-amber-500" /><span className="text-sm">{String(e.rating ?? 0)}</span></div>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">{e.description as string}</p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary">{e.category as string}</Badge>
              <Button size="sm"><Download className="mr-1 size-3" /> Install</Button>
            </div>
          </div>
        ))}
      </div>
      {!entries.length && !isLoading && <div className="rounded-lg border p-8 text-center text-muted-foreground">No marketplace listings yet.</div>}
    </div>
  );
}
