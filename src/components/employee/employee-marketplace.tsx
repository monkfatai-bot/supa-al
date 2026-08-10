"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Store, Search, Star, Download, Loader2,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import {
  getMarketplaceEmployees,
  installMarketplaceEmployee,
  rateMarketplaceEmployee,
} from "@/services/employee";
import type { EmployeeMarketplace, AiEmployee } from "@/services/employee";
import { useToast } from "@/hooks/use-toast";

// ── Props ─────────────────────────────────────────────────────────────

interface EmployeeMarketplaceProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function EmployeeMarketplace({ workspaceId }: EmployeeMarketplaceProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<(EmployeeMarketplace & { employee?: AiEmployee })[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const pageSize = 12;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMarketplaceEmployees({
        page,
        pageSize,
        category: filterCategory,
        search: searchQuery || undefined,
        featured: featuredOnly || undefined,
      });
      if ("error" in result) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      } else {
        setItems(result.data);
        setTotal(result.total);
      }
    } catch {
      toast({ title: "Error", description: "Failed to load marketplace", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, filterCategory, searchQuery, featuredOnly, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleInstall = async (employeeId: string) => {
    setInstalling(employeeId);
    try {
      const result = await installMarketplaceEmployee(employeeId, workspaceId);
      if (result.success) {
        toast({ title: "Installed", description: result.message });
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to install", variant: "destructive" });
    } finally {
      setInstalling(null);
    }
  };

  const handleRate = async (employeeId: string, rating: number) => {
    const result = await rateMarketplaceEmployee(employeeId, rating, workspaceId);
    if (result.success) {
      toast({ title: "Rated", description: "Thanks for your rating!" });
      fetchItems();
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Store className="size-6" /> AI Employee Marketplace
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Discover and install pre-built AI employees
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/employees">
            <Button variant="outline">Back to Directory</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search marketplace..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="engineering">Engineering</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="design">Design</SelectItem>
                <SelectItem value="operations">Operations</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={featuredOnly ? "default" : "outline"}
              size="sm"
              onClick={() => { setFeaturedOnly(!featuredOnly); setPage(1); }}
            >
              <Star className="size-4 mr-1.5" /> Featured
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-12 w-12 rounded-full mb-3" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2 mb-4" />
                <Skeleton className="h-20 w-full mb-3" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12">
            <Store className="size-12 text-muted-foreground" />
            <h3 className="font-semibold text-lg">No marketplace employees found</h3>
            <p className="text-muted-foreground text-sm">
              Check back later for new additions
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Bot className="size-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {item.employee?.name ?? "AI Employee"}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.employee?.role ?? item.category}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.is_featured && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          <Star className="size-3 mr-0.5" /> Featured
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        v{item.version}
                      </Badge>
                    </div>
                  </div>
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{item.description}</p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1">
                    <Star className="size-3.5 text-amber-500 fill-amber-500" />
                    <span className="text-xs font-medium">{item.rating?.toFixed(1) ?? "N/A"}</span>
                    <span className="text-[10px] text-muted-foreground">({item.review_count})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Download className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{item.install_count} installs</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleInstall(item.employee_id)}
                    disabled={installing === item.employee_id}
                  >
                    {installing === item.employee_id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4 mr-1.5" />
                    )}
                    Install
                  </Button>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleRate(item.employee_id, star)}
                        className="p-0.5 hover:text-amber-500 text-muted-foreground transition-colors"
                      >
                        <Star
                          className="size-3.5"
                          fill={star <= Math.round(item.rating ?? 0) ? "currentColor" : "none"}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-3">Page {page} of {totalPages}</span>
          <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
