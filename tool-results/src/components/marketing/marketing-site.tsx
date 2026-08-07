"use client";

/**
 * Supa AI — Marketing site container.
 *
 * Top-level client component rendered by `/` when an anonymous visitor
 * lands without an auth intent. Owns the internal view state (which
 * marketing page is currently displayed) and wires the navbar + footer
 * around the active page.
 *
 * View state is derived from the URL `?view=` query param so deep links
 * work (`/?view=pricing` lands on the pricing page). Navigation updates
 * the URL via `router.push` and reflects back into local state via the
 * searchParams subscription.
 *
 * @module @/components/marketing/marketing-site
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MarketingNavbar } from "./marketing-navbar";
import { MarketingFooter } from "./marketing-footer";
import {
  MARKETING_NAV_ITEMS,
  type MarketingViewId,
} from "./marketing-data";
import { HomePage } from "./pages/home-page";
import { ProductsPage } from "./pages/products-page";
import { PricingPage } from "./pages/pricing-page";
import { BlogPage } from "./pages/blog-page";
import { DocsPage } from "./pages/docs-page";
import { MarketplacePage } from "./pages/marketplace-page";
import { AiEmployeesPage } from "./pages/ai-employees-page";
import { WorkflowsPage } from "./pages/workflows-page";
import { IntegrationsPage } from "./pages/integrations-page";
import { ContactPage } from "./pages/contact-page";
import { AboutPage } from "./pages/about-page";
import { ChangelogPage } from "./pages/changelog-page";

const VALID_VIEWS: ReadonlySet<MarketingViewId> = new Set<MarketingViewId>([
  "home",
  "products",
  "pricing",
  "blog",
  "docs",
  "marketplace",
  "ai-employees",
  "workflows",
  "integrations",
  "contact",
  "about",
  "changelog",
]);

function readViewFromParams(params: URLSearchParams | null): MarketingViewId {
  if (!params) return "home";
  const raw = params.get("view");
  if (raw && VALID_VIEWS.has(raw as MarketingViewId)) {
    return raw as MarketingViewId;
  }
  return "home";
}

export function MarketingSite() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = React.useState<MarketingViewId>(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    return readViewFromParams(params);
  });

  // Keep local state in sync when the URL changes (back/forward, deep link).
  React.useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    setView(readViewFromParams(params));
  }, [searchParams]);

  const handleNavigate = React.useCallback(
    (next: MarketingViewId) => {
      const params = new URLSearchParams();
      if (next !== "home") params.set("view", next);
      const qs = params.toString();
      const href = qs ? `/?${qs}` : "/";
      router.push(href);
      setView(next);
      // Scroll to top so the new page starts at the hero, not wherever the
      // user was scrolled to on the previous page.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [router],
  );

  // The nav-config comes from marketing-data so we always render the same
  // set of primary links (Home / Products / Pricing / Blog / Docs / Changelog).
  // We mark a nav item as active if it matches the current view OR if the
  // current view isn't in the nav set and the nav item is Home (so Home
  // stays highlighted as the landing page).
  const active = view;
  // Suppress the unused-vars warning for MARKETING_NAV_ITEMS — it's used
  // implicitly by the navbar's import; keep this line for type-completeness
  // (TS doesn't complain but the linter sometimes does).
  void MARKETING_NAV_ITEMS;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNavbar active={active} onNavigate={handleNavigate} />
      <main className="flex-1">
        {view === "home" ? (
          <HomePage onNavigate={handleNavigate} />
        ) : view === "products" ? (
          <ProductsPage onNavigate={handleNavigate} />
        ) : view === "pricing" ? (
          <PricingPage onNavigate={handleNavigate} />
        ) : view === "blog" ? (
          <BlogPage />
        ) : view === "docs" ? (
          <DocsPage />
        ) : view === "marketplace" ? (
          <MarketplacePage />
        ) : view === "ai-employees" ? (
          <AiEmployeesPage />
        ) : view === "workflows" ? (
          <WorkflowsPage />
        ) : view === "integrations" ? (
          <IntegrationsPage />
        ) : view === "contact" ? (
          <ContactPage />
        ) : view === "about" ? (
          <AboutPage />
        ) : view === "changelog" ? (
          <ChangelogPage />
        ) : (
          <HomePage onNavigate={handleNavigate} />
        )}
      </main>
      <MarketingFooter onNavigate={handleNavigate} />
    </div>
  );
}
