"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listPublishers,
  getPublisherProfile,
  getPublisherItems,
} from "@/services/integration-hub";
import type { ServiceResult } from "@/services/integration-hub";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Shield,
  ShieldCheck,
  Search,
  Star,
  Download,
  ExternalLink,
  Globe,
  Package,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface Publisher {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website_url: string | null;
  logo_url: string | null;
  owner_id: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface PublisherStats {
  rating: number | null;
  reviewCount: number;
  totalInstalls: number;
  totalItems: number;
}

interface PublisherWithStats extends Publisher, PublisherStats {}

interface PublisherItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  install_count: number;
  rating: number | null;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function renderStars(rating: number | null): React.ReactNode {
  if (rating === null) return <span className="text-muted-foreground text-sm">No ratings</span>;
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.25;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < full
              ? "fill-amber-400 text-amber-400"
              : i === full && hasHalf
                ? "fill-amber-400/50 text-amber-400"
                : "text-muted-foreground/30"
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

// ─── Component ──────────────────────────────────────────────────

export default function PublishersPage() {
  const [publishers, setPublishers] = useState<PublisherWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Profile dialog
  const [selectedPublisher, setSelectedPublisher] =
    useState<PublisherWithStats | null>(null);
  const [publisherItems, setPublisherItems] = useState<PublisherItem[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchPublishers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result: ServiceResult<{ publishers: Publisher[]; total: number }> =
        await listPublishers({
          search: debouncedSearch || undefined,
          verifiedOnly: verifiedOnly || undefined,
          limit: 50,
        });
      if (result.success && result.data) {
        // Enrich with stats (basic counts — the full profile endpoint has ratings)
        const enriched: PublisherWithStats[] = result.data.publishers.map(
          (p) => ({
            ...p,
            rating: null,
            reviewCount: 0,
            totalInstalls: 0,
            totalItems: 0,
          })
        );
        setPublishers(enriched);
      } else {
        toast.error(result.message || "Failed to load publishers");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, verifiedOnly]);

  useEffect(() => {
    fetchPublishers();
  }, [fetchPublishers]);

  const handleViewProfile = useCallback(async (publisher: PublisherWithStats) => {
    setLoadingProfile(true);
    setDialogOpen(true);
    setSelectedPublisher(publisher);
    try {
      const [profileResult, itemsResult] = await Promise.all([
        getPublisherProfile(publisher.id),
        getPublisherItems(publisher.id),
      ]);
      if (profileResult.success && profileResult.data) {
        setSelectedPublisher(profileResult.data as PublisherWithStats);
      }
      if (itemsResult.success && itemsResult.data) {
        setPublisherItems(itemsResult.data as unknown as PublisherItem[]);
      } else {
        setPublisherItems([]);
      }
    } catch {
      toast.error("Failed to load publisher details");
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Publisher Directory
        </h1>
        <p className="text-muted-foreground">
          Browse verified and unverified marketplace publishers.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search publishers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="verified-toggle"
            checked={verifiedOnly}
            onCheckedChange={setVerifiedOnly}
          />
          <Label htmlFor="verified-toggle" className="text-sm cursor-pointer">
            Verified only
          </Label>
        </div>
      </div>

      {/* Publisher Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : publishers.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">No publishers found</h3>
          <p className="text-muted-foreground text-sm text-center max-w-sm">
            {verifiedOnly
              ? "No verified publishers match your search."
              : "No publishers match your search criteria."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {publishers.map((pub) => (
            <Card
              key={pub.id}
              className="flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 text-lg font-bold text-muted-foreground">
                      {pub.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate flex items-center gap-1.5">
                        {pub.name}
                        {pub.is_verified && (
                          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs truncate">
                        @{pub.slug}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {pub.description || "No description available."}
                </p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    {pub.totalItems} items
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="h-3.5 w-3.5" />
                    {pub.totalInstalls} installs
                  </span>
                </div>
                {renderStars(pub.rating)}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleViewProfile(pub)}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                  View Profile
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Profile Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedPublisher?.name}
              {selectedPublisher?.is_verified && (
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              )}
            </DialogTitle>
            <DialogDescription>
              @{selectedPublisher?.slug}
            </DialogDescription>
          </DialogHeader>

          {loadingProfile ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : selectedPublisher ? (
            <div className="space-y-6">
              {/* Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Verification Status
                  </h4>
                  <Badge
                    variant="secondary"
                    className={
                      selectedPublisher.is_verified
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                    }
                  >
                    {selectedPublisher.is_verified ? "Verified" : "Unverified"}
                  </Badge>
                </div>
                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Stats
                  </h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">{selectedPublisher.totalItems}</span>{" "}
                      items published
                    </p>
                    <p>
                      <span className="font-medium">{selectedPublisher.totalInstalls}</span>{" "}
                      total installs
                    </p>
                  </div>
                </div>
              </div>

              {selectedPublisher.description && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    About
                  </h4>
                  <p className="text-sm">{selectedPublisher.description}</p>
                </div>
              )}

              {selectedPublisher.website_url && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={selectedPublisher.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {selectedPublisher.website_url}
                  </a>
                </div>
              )}

              {/* Rating */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Rating
                </h4>
                {renderStars(selectedPublisher.rating)}
                {selectedPublisher.reviewCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedPublisher.reviewCount} review(s)
                  </p>
                )}
              </div>

              {/* Marketplace Items */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">
                  Marketplace Items
                </h4>
                {publisherItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No items published yet.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Installs</TableHead>
                          <TableHead className="text-right">Rating</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {publisherItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {item.install_count}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.rating !== null
                                ? item.rating.toFixed(1)
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                Joined {formatDate(selectedPublisher.created_at)}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
