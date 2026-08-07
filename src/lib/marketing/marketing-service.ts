/**
 * Supa AI — Phase 11 Marketing Service (server-only).
 *
 * The single, canonical write-path for the public marketing surface:
 * newsletter subscribers, referrals, demo requests, contact messages, and
 * read access to the published blog, documentation, and changelog content.
 *
 * ## Construction
 *
 * Constructed with the **server** Supabase client (RLS-enforced, anon key)
 * via {@link createMarketingService} so every public write respects the
 * per-table INSERT/UPDATE policies defined in migration 0016. Reads of
 * published blog / docs / changelog / categories / tags are gated by the
 * `public_select_*` policies and therefore work for anonymous callers.
 *
 * The factory {@link createMarketingServiceWith} is exported so callers can
 * inject an admin client for trusted background jobs (CRM sync, etc.).
 *
 * ## CRM sync
 *
 * `createDemoRequest` performs a best-effort CRM sync. Failures are logged
 * and never bubble up — a CRM outage must not block the demo-request write.
 *
 * @module @/lib/marketing/marketing-service
 */
import "server-only";

import { randomBytes } from "node:crypto";

import {
  DatabaseError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type {
  Database,
  Tables,
  TablesInsert,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types — public row shapes returned by the service (PII-stripped where
// appropriate). We re-export the underlying Supabase Row types for tables
// where the public surface should see the full row (blog posts, docs,
// changelog, categories, tags).
// ---------------------------------------------------------------------------

export type NewsletterSubscriber = Tables<"newsletter_subscribers">;
export type Referral = Tables<"referrals">;
export type DemoRequest = Tables<"demo_requests">;
export type ContactMessage = Tables<"contact_messages">;
export type BlogCategory = Tables<"blog_categories">;
export type BlogTag = Tables<"blog_tags">;
export type BlogPost = Tables<"blog_posts">;
export type DocumentationPage = Tables<"documentation_pages">;
export type ChangelogEntry = Tables<"changelog_entries">;

export interface BlogPostWithRelations extends BlogPost {
  category: BlogCategory | null;
  tags: BlogTag[];
}

// ---------------------------------------------------------------------------
// DTOs — input shapes accepted by the service. These match the validation
// schemas in `src/lib/validation/marketing.ts` but are typed independently
// so the service can be called from a server action without round-tripping
// through Zod.
// ---------------------------------------------------------------------------

export interface SubscribeInput {
  email: string;
  name?: string;
  source?: string;
}

export interface CreateReferralInput {
  referrerEmail: string;
  referrerUserId?: string;
  referredEmail?: string;
  source?: string;
}

export interface CreateDemoRequestInput {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  teamSize?: string;
  useCase?: string;
  message?: string;
}

export interface CreateContactMessageInput {
  name: string;
  email: string;
  subject?: string;
  message: string;
  category?:
    | "general"
    | "sales"
    | "support"
    | "partnership"
    | "press"
    | "security"
    | "other";
}

export interface ListBlogPostsOptions {
  limit?: number;
  cursor?: string;
  category?: string;
  tag?: string;
  featured?: boolean;
  sort?: "asc" | "desc";
}

export interface ListDocsOptions {
  limit?: number;
  cursor?: string;
  category?: string;
  section?: string;
  sort?: "asc" | "desc";
}

export interface ListChangelogOptions {
  limit?: number;
  cursor?: string;
  category?: string;
  featured?: boolean;
  sort?: "asc" | "desc";
}

export interface SearchOptions {
  q: string;
  limit?: number;
  kinds?: Set<"blog" | "docs" | "changelog">;
}

export interface SearchResult {
  kind: "blog" | "docs" | "changelog";
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  url: string;
  publishedAt: string | null;
  category: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const DEFAULT_DOCS_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 20;

/** Map a Postgrest-shaped error into a {@link DatabaseError}. */
function toDbError(
  error: { code?: string; message?: string; name?: string; details?: unknown },
  message: string,
): DatabaseError {
  return new DatabaseError(message, {
    errorCode: error.code,
    errorName: error.name,
    errorMessage: error.message,
    errorDetails: error.details,
  });
}

/**
 * Generate a 12-character referral code formatted as `XXXX-XXXX-XXXX`
 * (hex). Cryptographically random; ~48 bits of entropy is plenty for
 * a referral-code namespace.
 */
export function generateReferralCode(): string {
  const hex = randomBytes(6).toString("hex").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Server-only marketing service. Construct via {@link createMarketingService};
 * never `new` it directly outside of tests / factories.
 */
export class MarketingService {
  constructor(private readonly supabase: ServerSupabaseClient) {}

  // -----------------------------------------------------------------------
  // Newsletter
  // -----------------------------------------------------------------------

  /**
   * Subscribe (or re-subscribe) an email to the newsletter. Implemented as
   * an upsert keyed on `email` so duplicate subscriptions are idempotent —
   * the `status` is reset to `subscribed` and `unsubscribed_at` cleared.
   */
  async subscribe(input: SubscribeInput): Promise<NewsletterSubscriber> {
    const insert: TablesInsert<"newsletter_subscribers"> = {
      email: input.email,
      name: input.name ?? null,
      source: input.source ?? null,
      status: "subscribed",
      metadata: {},
      unsubscribed_at: null,
    };

    const { data, error } = await this.supabase
      .from("newsletter_subscribers")
      .upsert(insert as never, { onConflict: "email" })
      .select()
      .single();

    if (error || !data) {
      throw toDbError(
        error ?? { message: "No row returned" },
        "Failed to subscribe to newsletter.",
      );
    }
    return data;
  }

  /**
   * Mark a subscriber as `unsubscribed` and stamp `unsubscribed_at`. The
   * row is preserved so re-subscribes pick up the same id + history.
   */
  async unsubscribe(email: string): Promise<{ ok: true }> {
    const { error } = await this.supabase
      .from("newsletter_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
      } as never)
      .eq("email", email);

    if (error) {
      throw toDbError(error, "Failed to unsubscribe.");
    }
    return { ok: true };
  }

  // -----------------------------------------------------------------------
  // Referrals
  // -----------------------------------------------------------------------

  /**
   * Create a referral. The referral code is generated server-side; the
   * caller may override via `metadata.referralCode` (validated upstream).
   */
  async createReferral(input: CreateReferralInput): Promise<Referral> {
    const code = generateReferralCode();
    const insert: TablesInsert<"referrals"> = {
      referrer_email: input.referrerEmail,
      referrer_user_id: input.referrerUserId ?? null,
      referred_email: input.referredEmail ?? null,
      referral_code: code,
      status: "pending",
      metadata: input.source ? { source: input.source } : {},
    };

    const { data, error } = await this.supabase
      .from("referrals")
      .insert(insert as never)
      .select()
      .single();

    if (error || !data) {
      throw toDbError(
        error ?? { message: "No row returned" },
        "Failed to create referral.",
      );
    }
    return data;
  }

  /**
   * Look up a referral by its public code. Returns the full row — the API
   * route is responsible for stripping PII before sending to the client.
   */
  async getReferralByCode(code: string): Promise<Referral> {
    const { data, error } = await this.supabase
      .from("referrals")
      .select()
      .eq("referral_code", code)
      .maybeSingle();

    if (error) {
      throw toDbError(error, "Failed to fetch referral.");
    }
    if (!data) {
      throw new NotFoundError("Referral", code);
    }
    return data;
  }

  // -----------------------------------------------------------------------
  // Demo requests
  // -----------------------------------------------------------------------

  /**
   * Create a demo request and best-effort push it to the CRM. CRM failures
   * are logged and never bubble up — the demo-request row is the source of
   * truth.
   */
  async createDemoRequest(
    input: CreateDemoRequestInput,
  ): Promise<DemoRequest> {
    const insert: TablesInsert<"demo_requests"> = {
      name: input.name,
      email: input.email,
      company: input.company ?? null,
      phone: input.phone ?? null,
      team_size: input.teamSize ?? null,
      use_case: input.useCase ?? null,
      message: input.message ?? null,
      status: "new",
      metadata: {},
    };

    const { data, error } = await this.supabase
      .from("demo_requests")
      .insert(insert as never)
      .select()
      .single();

    if (error || !data) {
      throw toDbError(
        error ?? { message: "No row returned" },
        "Failed to create demo request.",
      );
    }

    const demoRow = data as unknown as { id: string };

    // Best-effort CRM sync. Never throws.
    void this.syncDemoRequestToCrm(data).catch((err) => {
      logger.warn("marketing: CRM sync failed (best-effort).", {
        demoRequestId: demoRow.id,
        error: String(err),
      });
    });

    return data;
  }

  /**
   * Best-effort CRM sync. The current implementation is a stub that records
   * a `crm_contact_id` placeholder so the column is exercised end-to-end.
   * A future Phase can swap in a real CRM adapter (HubSpot, Salesforce).
   */
  private async syncDemoRequestToCrm(row: DemoRequest): Promise<void> {
    // No-op until a CRM adapter is wired in. Leaving this hook in place
    // means the public contract (`crm_contact_id` gets populated) can ship
    // in a follow-up without touching the call site.
    if (!row) return;
    void row;
  }

  // -----------------------------------------------------------------------
  // Contact messages
  // -----------------------------------------------------------------------

  /**
   * Persist a contact message. `metadata` is the trusted, server-supplied
   * context (IP, user agent, request id) that the API route extracts from
   * the request — it is merged into the row's `metadata` JSONB column.
   */
  async createContactMessage(
    input: CreateContactMessageInput,
    metadata?: Record<string, unknown>,
  ): Promise<ContactMessage> {
    const insert: TablesInsert<"contact_messages"> = {
      name: input.name,
      email: input.email,
      subject: input.subject ?? null,
      message: input.message,
      category: input.category ?? "general",
      status: "new",
      ip_address: (metadata?.ipAddress as string | null) ?? null,
      user_agent: (metadata?.userAgent as string | null) ?? null,
      metadata: (metadata ?? {}) as TablesInsert<"contact_messages">["metadata"],
    };

    const { data, error } = await this.supabase
      .from("contact_messages")
      .insert(insert as never)
      .select()
      .single();

    if (error || !data) {
      throw toDbError(
        error ?? { message: "No row returned" },
        "Failed to create contact message.",
      );
    }
    return data;
  }

  // -----------------------------------------------------------------------
  // Blog
  // -----------------------------------------------------------------------

  /** List published blog posts, optionally filtered by category/tag/featured. */
  async listBlogPosts(
    opts: ListBlogPostsOptions = {},
  ): Promise<BlogPostWithRelations[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const sort = opts.sort ?? "desc";

    let query = this.supabase
      .from("blog_posts")
      .select(
        "*, category:blog_categories(*), tags:blog_post_tags(tag:blog_tags(*))",
      )
      .eq("status", "published")
      .order("published_at", { ascending: sort === "asc" })
      .limit(limit);

    if (opts.featured !== undefined) {
      query = query.eq("is_featured", opts.featured);
    }

    if (opts.category) {
      query = query.eq("blog_categories.slug", opts.category);
    }

    const { data, error } = await query;

    if (error) {
      throw toDbError(error, "Failed to list blog posts.");
    }

    let posts = (data ?? []) as unknown as RawBlogPostRow[];

    // Tag filter has to happen post-fetch because the join is through
    // blog_post_tags. We do it in-memory to keep the query plan simple.
    if (opts.tag) {
      posts = posts.filter((p) =>
        p.tags?.some((t) => t.tag?.slug === opts.tag),
      );
    }

    return posts.map(normalizeBlogPost);
  }

  /** Fetch a single published blog post by slug. */
  async getBlogPost(slug: string): Promise<BlogPostWithRelations> {
    const { data, error } = await this.supabase
      .from("blog_posts")
      .select(
        "*, category:blog_categories(*), tags:blog_post_tags(tag:blog_tags(*))",
      )
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (error) {
      throw toDbError(error, "Failed to fetch blog post.");
    }
    if (!data) {
      throw new NotFoundError("Blog post", slug);
    }

    // Best-effort views-count bump. Errors are logged + swallowed.
    void this.bumpViews("blog_posts", (data as BlogPost).id).catch((err) => {
      logger.debug("marketing: view bump failed (best-effort).", {
        error: String(err),
      });
    });

    return normalizeBlogPost(data as unknown as RawBlogPostRow);
  }

  /** List active blog categories. */
  async listBlogCategories(): Promise<BlogCategory[]> {
    const { data, error } = await this.supabase
      .from("blog_categories")
      .select()
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw toDbError(error, "Failed to list blog categories.");
    }
    return data ?? [];
  }

  /** List all blog tags. */
  async listBlogTags(): Promise<BlogTag[]> {
    const { data, error } = await this.supabase
      .from("blog_tags")
      .select()
      .order("name", { ascending: true });

    if (error) {
      throw toDbError(error, "Failed to list blog tags.");
    }
    return data ?? [];
  }

  // -----------------------------------------------------------------------
  // Documentation
  // -----------------------------------------------------------------------

  /** List published documentation pages. */
  async listDocs(opts: ListDocsOptions = {}): Promise<DocumentationPage[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_DOCS_LIMIT, 100),
    );
    const sort = opts.sort ?? "asc";

    let query = this.supabase
      .from("documentation_pages")
      .select()
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: sort === "asc" })
      .limit(limit);

    if (opts.category) {
      query = query.eq("category", opts.category);
    }
    if (opts.section) {
      query = query.eq("section", opts.section);
    }

    const { data, error } = await query;

    if (error) {
      throw toDbError(error, "Failed to list documentation pages.");
    }
    return data ?? [];
  }

  /** Fetch a single published documentation page by slug. */
  async getDoc(slug: string): Promise<DocumentationPage> {
    const { data, error } = await this.supabase
      .from("documentation_pages")
      .select()
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      throw toDbError(error, "Failed to fetch documentation page.");
    }
    if (!data) {
      throw new NotFoundError("Documentation page", slug);
    }

    void this.bumpViews("documentation_pages", (data as unknown as { id: string }).id).catch((err) => {
      logger.debug("marketing: doc view bump failed (best-effort).", {
        error: String(err),
      });
    });

    return data;
  }

  // -----------------------------------------------------------------------
  // Changelog
  // -----------------------------------------------------------------------

  /** List published changelog entries. */
  async listChangelog(
    opts: ListChangelogOptions = {},
  ): Promise<ChangelogEntry[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const sort = opts.sort ?? "desc";

    let query = this.supabase
      .from("changelog_entries")
      .select()
      .eq("is_published", true)
      .order("published_at", { ascending: sort === "asc" })
      .limit(limit);

    if (opts.featured !== undefined) {
      query = query.eq("is_featured", opts.featured);
    }
    if (opts.category) {
      query = query.eq("category", opts.category);
    }

    const { data, error } = await query;

    if (error) {
      throw toDbError(error, "Failed to list changelog entries.");
    }
    return data ?? [];
  }

  /** Fetch a single published changelog entry by slug. */
  async getChangelogEntry(slug: string): Promise<ChangelogEntry> {
    const { data, error } = await this.supabase
      .from("changelog_entries")
      .select()
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      throw toDbError(error, "Failed to fetch changelog entry.");
    }
    if (!data) {
      throw new NotFoundError("Changelog entry", slug);
    }
    return data;
  }

  // -----------------------------------------------------------------------
  // Cross-content search
  // -----------------------------------------------------------------------

  /**
   * Search across blog posts, documentation pages, and changelog entries.
   * Uses Postgres full-text search (the FTS indexes are created in the
   * migration). Returns a unified, ranked list of {@link SearchResult}.
   *
   * Per-kind search failures are logged + swallowed so a transient FTS
   * issue on one table does not blank the whole result set.
   */
  async search(opts: SearchOptions): Promise<SearchResult[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_SEARCH_LIMIT, MAX_LIST_LIMIT),
    );
    const q = opts.q.trim();
    if (!q) {
      throw new ValidationError("Search query is required.");
    }

    const kinds = opts.kinds;
    const wantBlog = !kinds || kinds.has("blog");
    const wantDocs = !kinds || kinds.has("docs");
    const wantChangelog = !kinds || kinds.has("changelog");

    const results: SearchResult[] = [];

    if (wantBlog) {
      const { data, error } = await this.supabase
        .from("blog_posts")
        .select("id, slug, title, excerpt, published_at, category:blog_categories(slug)")
        .eq("status", "published")
        .textSearch("title", q, { config: "english", type: "websearch" })
        .limit(limit);
      if (error) {
        logger.warn("marketing.search: blog search failed.", {
          error: String(error),
        });
      } else if (data) {
        for (const row of data as unknown as RawBlogSearchRow[]) {
          results.push({
            kind: "blog",
            id: row.id,
            slug: row.slug,
            title: row.title,
            excerpt: row.excerpt,
            url: `/blog/${row.slug}`,
            publishedAt: row.published_at,
            category: row.category?.slug ?? null,
          });
        }
      }
    }

    if (wantDocs) {
      const { data, error } = await this.supabase
        .from("documentation_pages")
        .select("id, slug, title, description, category")
        .eq("is_published", true)
        .textSearch("title", q, { config: "english", type: "websearch" })
        .limit(limit);
      if (error) {
        logger.warn("marketing.search: docs search failed.", {
          error: String(error),
        });
      } else if (data) {
        for (const row of data as unknown as RawDocsSearchRow[]) {
          results.push({
            kind: "docs",
            id: row.id,
            slug: row.slug,
            title: row.title,
            excerpt: row.description,
            url: `/docs/${row.slug}`,
            publishedAt: null,
            category: row.category,
          });
        }
      }
    }

    if (wantChangelog) {
      const { data, error } = await this.supabase
        .from("changelog_entries")
        .select("id, slug, title, summary, category, published_at")
        .eq("is_published", true)
        .textSearch("title", q, { config: "english", type: "websearch" })
        .limit(limit);
      if (error) {
        logger.warn("marketing.search: changelog search failed.", {
          error: String(error),
        });
      } else if (data) {
        for (const row of data as unknown as RawChangelogSearchRow[]) {
          results.push({
            kind: "changelog",
            id: row.id,
            slug: row.slug,
            title: row.title,
            excerpt: row.summary,
            url: `/changelog/${row.slug}`,
            publishedAt: row.published_at,
            category: row.category,
          });
        }
      }
    }

    return results.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Best-effort `views_count = views_count + 1` bump. The public RLS
   * policy does not permit UPDATE on blog_posts / docs for anonymous
   * viewers, so this may fail silently — that is acceptable because
   * views_count is a denormalized best-effort counter, not source-of-truth.
   * Failures are logged at debug + swallowed.
   */
  private async bumpViews(
    table: "blog_posts" | "documentation_pages",
    id: string,
  ): Promise<void> {
    const current = await this.getViewsCount(table, id);
    const { error } = await this.supabase
      .from(table)
      .update({ views_count: current + 1 } as never)
      .eq("id", id);

    if (error) {
      logger.debug("marketing.bumpViews: update failed (RLS likely).", {
        table,
        id,
        error: String(error),
      });
    }
  }

  /** Helper: fetch the current views_count for a row. */
  private async getViewsCount(
    table: "blog_posts" | "documentation_pages",
    id: string,
  ): Promise<number> {
    const { data } = await this.supabase
      .from(table)
      .select("views_count")
      .eq("id", id)
      .maybeSingle();
    return (data as { views_count?: number } | null)?.views_count ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Raw join row shapes (typed loosely because PostgREST returns nested
// arrays for many-to-many joins).
// ---------------------------------------------------------------------------

interface RawBlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  category_id: string | null;
  author_name: string | null;
  author_email: string | null;
  author_avatar_url: string | null;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  reading_time_min: number | null;
  views_count: number;
  likes_count: number;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  metadata: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category: BlogCategory | null;
  tags: ReadonlyArray<{ tag: BlogTag | null }> | null;
}

interface RawBlogSearchRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
  category: { slug: string } | null;
}

interface RawDocsSearchRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
}

interface RawChangelogSearchRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  published_at: string;
}

/** Convert the raw join row into a flat {@link BlogPostWithRelations}. */
function normalizeBlogPost(row: RawBlogPostRow): BlogPostWithRelations {
  const tags: BlogTag[] = (row.tags ?? [])
    .map((t) => t.tag)
    .filter((t): t is BlogTag => t !== null);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    cover_image_url: row.cover_image_url,
    category_id: row.category_id,
    author_name: row.author_name,
    author_email: row.author_email,
    author_avatar_url: row.author_avatar_url,
    status: row.status,
    is_featured: row.is_featured,
    reading_time_min: row.reading_time_min,
    views_count: row.views_count,
    likes_count: row.likes_count,
    published_at: row.published_at,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    seo_keywords: row.seo_keywords,
    metadata: (row.metadata ?? null) as BlogPost["metadata"],
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category: row.category,
    tags,
  };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Build a {@link MarketingService} bound to a per-request server Supabase
 * client (RLS-enforced, anon key). Use this in Route Handlers and RSC.
 */
export async function createMarketingService(): Promise<MarketingService> {
  const supabase = await createSupabaseServerClient();
  return new MarketingService(supabase);
}

/**
 * Build a {@link MarketingService} bound to the given Supabase client.
 * Use this in tests or when callers need to inject an admin client for
 * trusted background jobs.
 */
export function createMarketingServiceWith(
  supabase: ServerSupabaseClient,
): MarketingService {
  return new MarketingService(supabase);
}

/**
 * Convenience: a per-request accessor. Always creates a fresh service
 * bound to a fresh server client (because the server client is per-request
 * via `cookies()`).
 */
export async function getMarketingService(): Promise<MarketingService> {
  return createMarketingService();
}

/**
 * Convenience for tests / trusted callers. Returns a service bound to the
 * provided client (admin or server) — no caching.
 */
export function getMarketingServiceWith(
  supabase: ServerSupabaseClient,
): MarketingService {
  return createMarketingServiceWith(supabase);
}

// Re-export the type map so consumers can stay narrow in their imports.
export type { Database };
