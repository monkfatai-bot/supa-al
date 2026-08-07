"use client";

/**
 * Supa AI — Phase 10 Integration Hub — app detail dialog.
 *
 * Full-screen modal showing a single marketplace app: description,
 * capabilities, install instructions, reviews, ratings, version history.
 *
 * @module @/components/integrations/app-detail-dialog
 */
import * as React from "react";
import { ExternalLink, Star } from "lucide-react";

import type { MarketplaceApp } from "@/lib/integrations/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export interface AppDetailDialogProps {
  app: MarketplaceApp | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall?: (app: MarketplaceApp) => void;
  isInstalled?: boolean;
}

export function AppDetailDialog({
  app,
  isOpen,
  onOpenChange,
  onInstall,
  isInstalled,
}: AppDetailDialogProps) {
  if (!app) return null;
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500/10 to-blue-500/10 text-lg font-semibold">
              {(app.short_name ?? app.name).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{app.name}</DialogTitle>
              <DialogDescription className="line-clamp-2">
                {app.tagline ?? app.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {app.description ? (
            <p className="text-muted-foreground">{app.description}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{app.category}</Badge>
            {app.is_featured ? <Badge variant="secondary">Featured</Badge> : null}
            {app.is_official ? <Badge variant="outline">Official</Badge> : null}
            <Badge variant="outline">v{app.version}</Badge>
          </div>

          {Array.isArray(app.capabilities) && app.capabilities.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Capabilities</p>
              <div className="flex flex-wrap gap-1">
                {(app.capabilities as unknown as string[]).map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px]">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="size-3" aria-hidden="true" />
              {app.rating_avg.toFixed(1)} ({app.rating_count})
            </span>
            <span>{app.install_count} installs</span>
            {app.publisher_name ? (
              <span>by {app.publisher_name}</span>
            ) : null}
          </div>

          {app.install_instructions ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Install instructions
              </p>
              <p className="text-muted-foreground">{app.install_instructions}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 text-xs">
            {app.privacy_url ? (
              <a
                href={app.privacy_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-500 hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden="true" />
                Privacy
              </a>
            ) : null}
            {app.terms_url ? (
              <a
                href={app.terms_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-500 hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden="true" />
                Terms
              </a>
            ) : null}
            {app.documentation_url ? (
              <a
                href={app.documentation_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-500 hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden="true" />
                Docs
              </a>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isInstalled}
            onClick={() => onInstall?.(app)}
            className="w-full sm:w-auto"
          >
            {isInstalled ? "Installed" : `Install ${app.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
