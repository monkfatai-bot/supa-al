"use client";

/**
 * Supa AI — Phase 10 Integration Hub — marketplace browser.
 *
 * Searchable, category-filterable grid of marketplace apps. Clicking a
 * card opens the {@link AppDetailDialog} for the full details + install
 * button.
 *
 * @module @/components/integrations/marketplace-browser
 */
import * as React from "react";
import { Search, Sparkles, ShieldCheck } from "lucide-react";

import type { MarketplaceApp } from "@/lib/integrations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  useInstallApp,
  useMarketplaceApps,
  useMarketplaceCategories,
} from "@/hooks/use-integrations";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { AppCard } from "./app-card";
import { AppDetailDialog } from "./app-detail-dialog";

interface MarketplaceBrowserProps {
  workspaceId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  ai_provider: "AI Providers",
  communication: "Communication",
  email: "Email",
  storage: "Storage",
  development: "Development",
  payments: "Payments",
  commerce: "Commerce",
  automation: "Automation",
  crm: "CRM",
  productivity: "Productivity",
  analytics: "Analytics",
  social: "Social",
  other: "Other",
};

export function MarketplaceBrowser({ workspaceId }: MarketplaceBrowserProps) {
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [openApp, setOpenApp] = React.useState<MarketplaceApp | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const { toast } = useToast();

  const appsQuery = useMarketplaceApps({
    search: search.trim() || undefined,
    category: category === "all" ? undefined : (category as never),
    limit: 50,
  });
  const categoriesQuery = useMarketplaceCategories();
  const installMutation = useInstallApp();

  const handleInstall = React.useCallback(
    (app: MarketplaceApp) => {
      installMutation.mutate(
        {
          workspaceId,
          appId: app.id,
        },
        {
          onSuccess: () => {
            toast({
              title: "Installed",
              description: `${app.name} is now available in your workspace.`,
            });
            setIsDialogOpen(false);
          },
          onError: (err: Error) => {
            toast({
              title: "Install failed",
              description: err.message,
              variant: "destructive",
            });
          },
        },
      );
    },
    [installMutation, workspaceId, toast],
  );

  const handleOpen = React.useCallback((app: MarketplaceApp) => {
    setOpenApp(app);
    setIsDialogOpen(true);
  }, []);

  return (
    <div className="space-y-4">
      {/* Search + category filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search marketplace..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">All categories</option>
          {(categoriesQuery.data ?? []).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </select>
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={category === "all" ? "default" : "outline"}
          onClick={() => setCategory("all")}
        >
          All
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCategory("featured")}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          Featured
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCategory("official")}
        >
          <ShieldCheck className="size-4" aria-hidden="true" />
          Official
        </Button>
      </div>

      {/* Grid */}
      {appsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : appsQuery.isError ? (
        <EmptyState
          icon={Search}
          title="Couldn't load marketplace"
          description="Please try again later."
        />
      ) : (appsQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={Search}
          title="No apps found"
          description="Try a different search or category."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(appsQuery.data ?? []).map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onInstall={handleInstall}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}

      <AppDetailDialog
        app={openApp}
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onInstall={handleInstall}
      />
    </div>
  );
}

export { CATEGORY_LABELS };
