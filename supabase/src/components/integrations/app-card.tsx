"use client";

/**
 * Supa AI — Phase 10 Integration Hub — marketplace app card.
 *
 * Compact card representing a single marketplace app — icon, name,
 * tagline, category badge, install count, rating, and an Install button.
 *
 * @module @/components/integrations/app-card
 */
import * as React from "react";
import { Download, Star, Users } from "lucide-react";

import type { MarketplaceApp } from "@/lib/integrations/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface AppCardProps {
  app: MarketplaceApp;
  /** True when the app is already installed in the active workspace. */
  isInstalled?: boolean;
  onInstall?: (app: MarketplaceApp) => void;
  onOpen?: (app: MarketplaceApp) => void;
  className?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai_provider: "AI Provider",
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

export function AppCard({
  app,
  isInstalled,
  onInstall,
  onOpen,
  className,
}: AppCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500/10 to-blue-500/10 text-lg font-semibold text-foreground">
          {(app.short_name ?? app.name).slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen?.(app)}
            className="block w-full text-left"
          >
            <p className="truncate text-sm font-semibold">{app.name}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {app.tagline ?? app.description ?? ""}
            </p>
          </button>
        </div>
        {app.is_featured ? (
          <Badge variant="secondary" className="shrink-0">
            Featured
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">
          {CATEGORY_LABELS[app.category] ?? app.category}
        </Badge>
        {app.is_official ? (
          <Badge variant="outline" className="text-[10px]">
            Official
          </Badge>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1">
          <Star className="size-3" aria-hidden="true" />
          {app.rating_avg.toFixed(1)} ({app.rating_count})
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="size-3" aria-hidden="true" />
          {app.install_count}
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Button
          size="sm"
          variant={isInstalled ? "secondary" : "default"}
          disabled={isInstalled}
          onClick={() => onInstall?.(app)}
          className="flex-1"
        >
          <Download className="size-4" aria-hidden="true" />
          {isInstalled ? "Installed" : "Install"}
        </Button>
      </div>
    </div>
  );
}
