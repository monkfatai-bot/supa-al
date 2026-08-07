/**
 * Supa AI — Marketing barrel.
 *
 * Single import surface for the marketing UI. The orchestrator's `/` route
 * imports `<MarketingSite>` from here; sub-components are re-exported for
 * granular use (storyshots, isolated testing).
 *
 * @module @/components/marketing
 */
export { MarketingSite } from "./marketing-site";
export { MarketingNavbar, type MarketingNavbarProps } from "./marketing-navbar";
export { MarketingFooter, type MarketingFooterProps } from "./marketing-footer";
export {
  MARKETING_NAV_ITEMS,
  MARKETING_PRODUCTS,
  SHOWCASE_TABS,
  PRICING_TIERS,
  MARKETING_STATS,
  TESTIMONIALS,
  TRUSTED_BY,
  COMPARISON_ROWS,
  FAQS,
  INTEGRATIONS,
  TRUST_PILLARS,
  HERO_HEADLINE,
  HERO_SUBHEADLINE,
  HERO_PRIMARY_CTA,
  HERO_SECONDARY_CTA,
  HERO_PRIMARY_HREF,
  HERO_SECONDARY_HREF,
  type MarketingViewId,
  type MarketingNavItem,
  type MarketingProduct,
  type ShowcaseTab,
  type PricingTier,
  type MarketingStat,
  type Testimonial,
  type ComparisonRow,
  type Faq,
  type IntegrationEntry,
  type TrustPillar,
} from "./marketing-data";

// Section exports
export { HeroSection } from "./sections/hero";
export { AiPlatformOverview, type AiPlatformOverviewProps } from "./sections/ai-platform-overview";
export { ProductShowcase } from "./sections/product-showcase";
export { TestimonialsSection } from "./sections/testimonials";
export { TrustedBySection } from "./sections/trusted-by";
export { FeatureComparisonSection } from "./sections/feature-comparison";
export { StatsSection } from "./sections/stats";
export { FaqSection } from "./sections/faq";
export { NewsletterSection } from "./sections/newsletter";
export { PricingSection, type PricingSectionProps } from "./sections/pricing";
export { PageHeader, type PageHeaderProps } from "./sections/page-header";

// Page exports
export { HomePage, type HomePageProps } from "./pages/home-page";
export { ProductsPage, type ProductsPageProps } from "./pages/products-page";
export { PricingPage, type PricingPageProps } from "./pages/pricing-page";
export { BlogPage } from "./pages/blog-page";
export { DocsPage } from "./pages/docs-page";
export { MarketplacePage } from "./pages/marketplace-page";
export { AiEmployeesPage } from "./pages/ai-employees-page";
export { WorkflowsPage } from "./pages/workflows-page";
export { IntegrationsPage } from "./pages/integrations-page";
export { ContactPage } from "./pages/contact-page";
export { AboutPage } from "./pages/about-page";
export { ChangelogPage } from "./pages/changelog-page";
