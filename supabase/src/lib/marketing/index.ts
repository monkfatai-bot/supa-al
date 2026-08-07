/**
 * Supa AI — Phase 11 marketing barrel (server-only).
 *
 * Re-exports the {@link MarketingService} class, the factory helpers, and
 * every type the service produces. The service itself imports
 * `next/headers` via `createSupabaseServerClient`, so importing this barrel
 * from a client component will fail to bundle.
 *
 * @module @/lib/marketing
 */
import "server-only";

export {
  MarketingService,
  createMarketingService,
  createMarketingServiceWith,
  getMarketingService,
  getMarketingServiceWith,
  generateReferralCode,
} from "./marketing-service";

export type {
  NewsletterSubscriber,
  Referral,
  DemoRequest,
  ContactMessage,
  BlogCategory,
  BlogTag,
  BlogPost,
  BlogPostWithRelations,
  DocumentationPage,
  ChangelogEntry,
  SubscribeInput,
  CreateReferralInput,
  CreateDemoRequestInput,
  CreateContactMessageInput,
  ListBlogPostsOptions,
  ListDocsOptions,
  ListChangelogOptions,
  SearchOptions,
  SearchResult,
} from "./marketing-service";
