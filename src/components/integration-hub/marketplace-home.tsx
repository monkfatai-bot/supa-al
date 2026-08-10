"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Star,
  Download,
  Package,
  TrendingUp,
  Sparkles,
  Loader2,
  X,
  Eye,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  listMarketplaceItems,
  getCategories,
  getFeaturedItems,
  searchMarketplace,
  installExtension,
} from "@/services/marketplace/actions";
import type {
  MarketplaceItemWithAuthor,
  CategoryWithCount,
  PaginatedMarketplaceResponse,
  MarketplaceActionResponse,
} from "@/services/marketplace/types";


// ── Helpers ──────────────────────────────────────────────────────

function getTypeColor(type: string): string {
  const map: Record<string, string> = {
    ai_employee: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    workflow_template: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    business_template: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    prompt_pack: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    node_pack: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    integration_pack: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    extension: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return map[type] ?? "bg-muted text-muted-foreground";
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    ai_employee: "AI Employee",
    workflow_template: "Workflow",
    business_template: "Template",
    prompt_pack: "Prompts",
    node_pack: "Nodes",
    integration_pack: "Integration",
    extension: "Extension",
  };
  return map[type] ?? type;
}

function renderStars(rating: number) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  const stars: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(
        <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
      );
    } else if (i === full && hasHalf) {
      stars.push(
        <Star key={i} className="h-3 w-3 fill-amber-400/50 text-amber-400" />
      );
    } else {
      stars.push(
        <Star key={i} className="h-3 w-3 text-muted-foreground/30" />
      );
    }
  }
  return stars;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Category icon map ────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  ai: "🤖",
  automation: "⚡",
  communication: "💬",
  productivity: "📊",
  development: "🔧",
  business: "💼",
};

// ── Item Card ─────────────────────────────────────────────────────

function ItemCard({
  item,
  onInstall,
  installing,
}: {
  item: MarketplaceItemWithAuthor;
  onInstall: (item: MarketplaceItemWithAuthor) => void;
  installing: boolean;
}) {
  return (
    <Card className="group flex h-full flex-col transition-all hover:shadow-md hover:border-foreground/20">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            {item.icon_url ? (
              <img
                src={item.icon_url}
                alt={item.name}
                className="h-5 w-5 rounded object-contain"
              />
            ) : (
              <Package className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm leading-tight line-clamp-1">
              {item.name}
            </CardTitle>
            <div className="mt-1 flex items-center gap-1.5">
              <Badge
                className={`text-[10px] px-1.5 border-0 ${getTypeColor(item.type)}`}
              >
                {getTypeLabel(item.type)}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3 pt-0">
        <p className="text-muted-foreground text-xs line-clamp-2">
          {item.description ?? "No description available"}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {renderStars(Number(item.rating) || 0)}
            </div>
            <span className="text-muted-foreground text-[10px]">
              ({item.review_count ?? 0})
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground text-xs">
            <Download className="h-3 w-3" />
            {formatCount(item.install_count ?? 0)}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {item.author?.full_name ?? item.author?.email ?? "Community"}
          </span>
          <span className="text-xs font-medium">
            {item.pricing_type === "free"
              ? "Free"
              : `$${Number(item.price ?? 0).toFixed(2)}`}
          </span>
        </div>
        <Button
          size="sm"
          className="w-full text-xs"
          disabled={installing}
          onClick={() => onInstall(item)}
        >
          {installing ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : item.pricing_type === "free" ? (
            <Download className="mr-1.5 h-3 w-3" />
          ) : (
            <Eye className="mr-1.5 h-3 w-3" />
          )}
          {item.pricing_type === "free" ? "Install" : "View"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Props ────────────────────────────────────────────────────────

interface MarketplaceHomeProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────

export function MarketplaceHome({ workspaceId }: MarketplaceHomeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const [featuredItems, setFeaturedItems] = useState<MarketplaceItemWithAuthor[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [trendingItems, setTrendingItems] = useState<MarketplaceItemWithAuthor[]>([]);
  const [newArrivals, setNewArrivals] = useState<MarketplaceItemWithAuthor[]>([]);
  const [searchResults, setSearchResults] = useState<MarketplaceItemWithAuthor[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      getFeaturedItems().then((res: MarketplaceActionResponse) => {
        if (res.success && Array.isArray(res.data)) {
          setFeaturedItems(res.data as MarketplaceItemWithAuthor[]);
        }
      }),
      getCategories().then((res: MarketplaceActionResponse) => {
        if (res.success && Array.isArray(res.data)) {
          setCategories(res.data as CategoryWithCount[]);
        }
      }),
      listMarketplaceItems({
        status: "published",
        sort: "install_count",
        limit: 6,
      }).then((res: PaginatedMarketplaceResponse<MarketplaceItemWithAuthor>) => {
        if (res.success && Array.isArray(res.data)) {
          setTrendingItems(res.data);
        }
      }),
      listMarketplaceItems({
        status: "published",
        sort: "created_at",
        limit: 6,
      }).then((res: PaginatedMarketplaceResponse<MarketplaceItemWithAuthor>) => {
        if (res.success && Array.isArray(res.data)) {
          setNewArrivals(res.data);
        }
      }),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Search handler (debounced via effect) ──────────────────────

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchMarketplace({
          query: searchQuery,
          limit: 20,
        });
        if (res.success && Array.isArray((res as PaginatedMarketplaceResponse<MarketplaceItemWithAuthor>).data)) {
          setSearchResults((res as PaginatedMarketplaceResponse<MarketplaceItemWithAuthor>).data);
        }
      } catch {
        // search failed silently
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Install handler ─────────────────────────────────────────────

  const handleInstall = async (item: MarketplaceItemWithAuthor) => {
    setInstallingId(item.id);
    try {
      const res = await installExtension(workspaceId, item.id);
      if (res.success) {
        toast.success(`${item.name} installed successfully`);
      } else {
        toast.error(res.message ?? "Failed to install extension");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setInstallingId(null);
    }
  };

  // ── Filtering ───────────────────────────────────────────────────

  const filteredTrending = activeCategory
    ? trendingItems.filter((i) => i.category_id === activeCategory)
    : trendingItems;
  const filteredNewArrivals = activeCategory
    ? newArrivals.filter((i) => i.category_id === activeCategory)
    : newArrivals;

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* ── Hero Section ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Marketplace</h2>
          <p className="text-muted-foreground text-sm">
            Discover extensions, templates, and integrations for your workspace
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search marketplace..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 hover:text-foreground"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Category Filter Pills ──────────────────────────────── */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeCategory === null ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setActiveCategory(null)}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? "default" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            >
              {CATEGORY_ICONS[cat.slug] ?? "📦"} {cat.name}
              <span className="ml-1 text-[10px] opacity-70">{cat.item_count ?? 0}</span>
            </Button>
          ))}
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Search Results ─────────────────────────────────────── */}
      {searchQuery.trim() ? (
        <div>
          <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Results ({searchResults.length})
          </h3>
          {isSearching ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {searchResults.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onInstall={handleInstall}
                  installing={installingId === item.id}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="text-muted-foreground mb-3 h-10 w-10" />
              <h3 className="text-lg font-medium">No results found</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Try adjusting your search query
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Featured Section ──────────────────────────────── */}
          {!loading || featuredItems.length > 0 ? (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <h3 className="text-lg font-semibold">Featured</h3>
              </div>
              {featuredItems.length > 0 ? (
                <ScrollArea className="w-full">
                  <div className="flex gap-4 pb-4">
                    {featuredItems.map((item) => (
                      <div
                        key={item.id}
                        className="w-72 shrink-0"
                      >
                        <ItemCard
                          item={item}
                          onInstall={handleInstall}
                          installing={installingId === item.id}
                        />
                      </div>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center rounded-lg border border-dashed p-8">
                  <p className="text-muted-foreground text-sm">No featured items yet</p>
                </div>
              )}
            </section>
          ) : null}

          {/* ── Browse by Category ─────────────────────────────── */}
          {!loading || categories.length > 0 ? (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Package className="h-5 w-5" />
                <h3 className="text-lg font-semibold">Browse by Category</h3>
              </div>
              {categories.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {categories.map((cat) => (
                    <Card
                      key={cat.id}
                      className="group cursor-pointer transition-all hover:shadow-md hover:border-foreground/20"
                      onClick={() => setActiveCategory(cat.id)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                            {CATEGORY_ICONS[cat.slug] ?? "📦"}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-sm">{cat.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {cat.item_count ?? 0} items
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-lg border border-dashed p-8">
                  <p className="text-muted-foreground text-sm">No categories available</p>
                </div>
              )}
            </section>
          ) : null}

          {/* ── Trending Section ────────────────────────────────── */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              <h3 className="text-lg font-semibold">Trending</h3>
              <Badge variant="secondary" className="text-[10px] px-1.5">
                Top by installs
              </Badge>
            </div>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-lg" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredTrending.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTrending.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onInstall={handleInstall}
                    installing={installingId === item.id}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="text-muted-foreground mb-2 h-8 w-8" />
                <p className="text-muted-foreground text-sm">No trending items yet</p>
              </div>
            )}
          </section>

          {/* ── New Arrivals Section ────────────────────────────── */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              <h3 className="text-lg font-semibold">New Arrivals</h3>
              <Badge variant="secondary" className="text-[10px] px-1.5">
                Latest published
              </Badge>
            </div>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-lg" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredNewArrivals.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredNewArrivals.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onInstall={handleInstall}
                    installing={installingId === item.id}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles className="text-muted-foreground mb-2 h-8 w-8" />
                <p className="text-muted-foreground text-sm">No new arrivals yet</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
