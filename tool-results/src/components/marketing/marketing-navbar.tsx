"use client";

/**
 * Supa AI — Marketing navbar.
 *
 * Sticky top bar shown on every marketing view. Renders the logo, primary
 * nav links, and the two CTAs (Sign in → ?signin=1, Get started → ?signup=1).
 *
 * On mobile (< md), collapses the nav into a Sheet triggered from a Menu
 * button so the navbar stays useful on small viewports.
 *
 * @module @/components/marketing/marketing-navbar
 */
import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/shared/logo";
import { MARKETING_NAV_ITEMS, type MarketingViewId } from "./marketing-data";

export interface MarketingNavbarProps {
  active: MarketingViewId;
  onNavigate: (id: MarketingViewId) => void;
  className?: string;
}

export function MarketingNavbar({
  active,
  onNavigate,
  className,
}: MarketingNavbarProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleNav = React.useCallback(
    (id: MarketingViewId) => {
      onNavigate(id);
      setMobileOpen(false);
    },
    [onNavigate],
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className,
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label="Supa AI home"
          onClick={() => handleNav("home")}
        >
          <Logo size={32} withWordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {MARKETING_NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => handleNav(item.id)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                active === item.id && "bg-accent text-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/?signin=1">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Link href="/?signup=1">Get started</Link>
          </Button>
        </div>

        {/* Mobile menu trigger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <div className="flex h-full flex-col gap-4 p-4">
              <Logo size={28} withWordmark />
              <nav className="flex flex-col gap-1" aria-label="Mobile primary">
                {MARKETING_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => handleNav(item.id)}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                      active === item.id && "bg-accent text-accent-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/?signin=1" onClick={() => setMobileOpen(false)}>
                    Sign in
                  </Link>
                </Button>
                <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <Link href="/?signup=1" onClick={() => setMobileOpen(false)}>
                    Get started
                  </Link>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
