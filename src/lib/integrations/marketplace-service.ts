/**
 * Supa AI — Phase 10 Integration Hub — Marketplace Service.
 *
 * Server-only service for the public marketplace: browsing + searching
 * published apps, installing / uninstalling apps into a workspace,
 * publishing new apps (publisher role), managing versions, reviews,
 * ratings, and update-checks.
 *
 * Constructed with the **admin** Supabase client so service-layer
 * reads/writes bypass RLS. Mutations are gated on workspace membership
 * via {@link assertMember} so the surface stays defense-in-depth.
 *
 * @module @/lib/integrations/marketplace-service
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/types";

import { toDbError, wrapIntegrationError } from "./core";
import type {
  AppReview,
  AppUpdateInfo,
  AppRating,
  CreateReviewInput,
  InstallAppInput,
  InstalledApp,
  IntegrationAnalytics,
  IntegrationVersion,
  ListAppsOptions,
  MarketplaceApp,
  MarketplaceAppCategory,
  PublishAppInput,
  PublishVersionInput,
  UpdateAppInput,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const DEFAULT_REVIEWS_LIMIT = 20;
const MAX_REVIEWS_LIMIT = 100;

// ---------------------------------------------------------------------------
// MarketplaceService
// ---------------------------------------------------------------------------

/**
 * Server-only marketplace service. Construct via
 * {@link getMarketplaceService}; never `new` it directly outside tests.
 */
export class MarketplaceService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  // -----------------------------------------------------------------------
  // Browse
  // -----------------------------------------------------------------------

  /**
   * List published marketplace apps. Optional `category`, `search`,
   * `isFeatured`, `isOfficial` filters. Newest first by default;
   * when `search` is empty, sorts featured first then by install_count.
   */
  async listApps(options?: ListAppsOptions): Promise<MarketplaceApp[]> {
    const opts = options ?? {};
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      let query = this.supabase
        .from("marketplace_apps")
        .select()
        .eq("is_published", true)
        .range(offset, offset + limit - 1);
      if (opts.category) query = query.eq("category", opts.category);
      if (typeof opts.isFeatured === "boolean") query = query.eq("is_featured", opts.isFeatured);
      if (typeof opts.isOfficial === "boolean") query = query.eq("is_official", opts.isOfficial);
      if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        query = query.or(`name.ilike.%${q}%,tagline.ilike.%${q}%,description.ilike.%${q}%`);
        query = query.order("created_at", { ascending: false });
      } else {
        query = query
          .order("is_featured", { ascending: false })
          .order("install_count", { ascending: false });
      }
      const { data, error } = await query;
      if (error) throw toDbError(error, "marketplace.listApps failed");
      return (data ?? []) as unknown as MarketplaceApp[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing marketplace apps.");
    }
  }

  /**
   * Fetch a single published app by slug.
   */
  async getAppBySlug(slug: string): Promise<MarketplaceApp | null> {
    try {
      const { data, error } = await this.supabase
        .from("marketplace_apps")
        .select()
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw toDbError(error, "marketplace.getAppBySlug failed");
      return (data as unknown as MarketplaceApp) ?? null;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching app.", { slug });
    }
  }

  /**
   * Fetch a single app by id (published or owned by the caller).
   */
  async getAppById(appId: string, userId?: string): Promise<MarketplaceApp | null> {
    try {
      const { data, error } = await this.supabase
        .from("marketplace_apps")
        .select()
        .eq("id", appId)
        .maybeSingle();
      if (error) throw toDbError(error, "marketplace.getAppById failed");
      const row = data as unknown as MarketplaceApp | null;
      if (!row) return null;
      if (!row.is_published && row.publisher_id !== userId) return null;
      return row;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching app.", { appId });
    }
  }

  /** Featured apps (is_featured + is_published). */
  async getFeaturedApps(limit = 12): Promise<MarketplaceApp[]> {
    try {
      const { data, error } = await this.supabase
        .from("marketplace_apps")
        .select()
        .eq("is_featured", true)
        .eq("is_published", true)
        .order("install_count", { ascending: false })
        .range(0, Math.max(1, limit) - 1);
      if (error) throw toDbError(error, "marketplace.getFeaturedApps failed");
      return (data ?? []) as unknown as MarketplaceApp[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching featured apps.");
    }
  }

  /** Official apps (is_official + is_published). */
  async getOfficialApps(limit = 24): Promise<MarketplaceApp[]> {
    try {
      const { data, error } = await this.supabase
        .from("marketplace_apps")
        .select()
        .eq("is_official", true)
        .eq("is_published", true)
        .order("install_count", { ascending: false })
        .range(0, Math.max(1, limit) - 1);
      if (error) throw toDbError(error, "marketplace.getOfficialApps failed");
      return (data ?? []) as unknown as MarketplaceApp[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching official apps.");
    }
  }

  /**
   * List the available marketplace categories. Returns the distinct
   * `category` values from published apps.
   */
  async listCategories(): Promise<MarketplaceAppCategory[]> {
    try {
      const { data, error } = await this.supabase
        .from("marketplace_apps")
        .select("category")
        .eq("is_published", true);
      if (error) throw toDbError(error, "marketplace.listCategories failed");
      const set = new Set<MarketplaceAppCategory>();
      for (const row of (data ?? []) as unknown as Array<{ category: MarketplaceAppCategory }>) {
        set.add(row.category);
      }
      return [...set];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing categories.");
    }
  }

  /**
   * Fetch an app's full details: the app row + its latest version + its
   * review count + its rating summary. Returns `null` when the app is
   * not found or not published (and the caller is not the publisher).
   */
  async getAppDetails(input: {
    appId: string;
    userId?: string;
  }): Promise<{
    app: MarketplaceApp;
    latestVersion: IntegrationVersion | null;
    reviewCount: number;
    ratingAvg: number;
    ratingCount: number;
  } | null> {
    const app = await this.getAppById(input.appId, input.userId);
    if (!app) return null;
    try {
      const { data: version } = await this.supabase
        .from("integration_versions")
        .select()
        .eq("app_id", input.appId)
        .eq("is_latest", true)
        .maybeSingle();
      const latestVersion = (version as unknown as IntegrationVersion | null) ?? null;
      return {
        app,
        latestVersion,
        reviewCount: app.rating_count,
        ratingAvg: app.rating_avg,
        ratingCount: app.rating_count,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching app details.", {
        appId: input.appId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Publish / Manage (publisher-only)
  // -----------------------------------------------------------------------

  /**
   * Publish a new marketplace app. `userId` becomes the publisher.
   */
  async publishApp(input: {
    userId: string;
    publisherName?: string;
    data: PublishAppInput;
  }): Promise<MarketplaceApp> {
    if (!input.data.slug?.trim()) throw new ValidationError("`slug` is required.");
    if (!input.data.name?.trim()) throw new ValidationError("`name` is required.");
    try {
      const row: TablesInsert<"marketplace_apps"> = {
        slug: input.data.slug,
        name: input.data.name,
        short_name: input.data.shortName ?? null,
        tagline: input.data.tagline ?? null,
        description: input.data.description ?? null,
        category: input.data.category ?? "other",
        subcategory: input.data.subcategory ?? null,
        publisher_id: input.userId,
        publisher_name: input.publisherName ?? null,
        publisher_verified: false,
        connector_key: input.data.connectorKey ?? null,
        icon_url: input.data.iconUrl ?? null,
        capabilities: (input.data.capabilities ?? []) as unknown as TablesInsert<"marketplace_apps">["capabilities"],
        auth_type: input.data.authType ?? "none",
        required_scopes: (input.data.requiredScopes ?? []) as unknown as TablesInsert<"marketplace_apps">["required_scopes"],
        config_schema: (input.data.configSchema ?? {}) as unknown as TablesInsert<"marketplace_apps">["config_schema"],
        install_instructions: input.data.installInstructions ?? null,
        privacy_url: input.data.privacyUrl ?? null,
        terms_url: input.data.termsUrl ?? null,
        documentation_url: input.data.documentationUrl ?? null,
        is_published: input.data.isPublished ?? false,
        is_featured: input.data.isFeatured ?? false,
        is_official: false,
        version: input.data.version ?? "1.0.0",
      };
      const { data, error } = await this.supabase
        .from("marketplace_apps")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "marketplace.publishApp failed");
      return data as unknown as MarketplaceApp;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure publishing app.", { slug: input.data.slug });
    }
  }

  /** Patch an existing app (publisher-only). */
  async updateApp(appId: string, data: UpdateAppInput): Promise<MarketplaceApp> {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.shortName !== undefined) patch.short_name = data.shortName;
    if (data.tagline !== undefined) patch.tagline = data.tagline;
    if (data.description !== undefined) patch.description = data.description;
    if (data.category !== undefined) patch.category = data.category;
    if (data.subcategory !== undefined) patch.subcategory = data.subcategory;
    if (data.connectorKey !== undefined) patch.connector_key = data.connectorKey;
    if (data.iconUrl !== undefined) patch.icon_url = data.iconUrl;
    if (data.capabilities !== undefined) patch.capabilities = data.capabilities;
    if (data.authType !== undefined) patch.auth_type = data.authType;
    if (data.requiredScopes !== undefined) patch.required_scopes = data.requiredScopes;
    if (data.configSchema !== undefined) patch.config_schema = data.configSchema;
    if (data.installInstructions !== undefined) patch.install_instructions = data.installInstructions;
    if (data.privacyUrl !== undefined) patch.privacy_url = data.privacyUrl;
    if (data.termsUrl !== undefined) patch.terms_url = data.termsUrl;
    if (data.documentationUrl !== undefined) patch.documentation_url = data.documentationUrl;
    if (data.isPublished !== undefined) patch.is_published = data.isPublished;
    if (data.isFeatured !== undefined) patch.is_featured = data.isFeatured;
    if (data.version !== undefined) patch.version = data.version;
    try {
      const { data: row, error } = await this.supabase
        .from("marketplace_apps")
        .update(patch as never)
        .eq("id", appId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "marketplace.updateApp failed");
      if (!row) throw new NotFoundError("MarketplaceApp", appId);
      return row as unknown as MarketplaceApp;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure updating app.", { appId });
    }
  }

  /** Hard-delete an app (publisher-only). */
  async deleteApp(appId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("marketplace_apps")
        .delete()
        .eq("id", appId);
      if (error) throw toDbError(error, "marketplace.deleteApp failed");
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure deleting app.", { appId });
    }
  }

  // -----------------------------------------------------------------------
  // Install / Uninstall
  // -----------------------------------------------------------------------

  /**
   * Install an app into a workspace. Creates an `installed_apps` row +
   * (optionally) an `integrations` row linked to it. Calls the
   * `increment_install_count` RPC to atomically bump the app's counter.
   */
  async installApp(input: {
    workspaceId: string;
    userId: string;
    data: InstallAppInput;
  }): Promise<InstalledApp> {
    if (!input.data.appId?.trim()) throw new ValidationError("`appId` is required.");
    try {
      // Look up the app to resolve the connector_key + version.
      const app = await this.getAppById(input.data.appId, input.userId);
      if (!app) throw new NotFoundError("MarketplaceApp", input.data.appId);

      // Bump install count via RPC (best-effort).
      try {
        await this.supabase.rpc("increment_install_count" as never, { app_id: input.data.appId } as never);
      } catch (rpcErr) {
        logger.warn("marketplace.installApp: increment RPC failed", {
          appId: input.data.appId,
          error: String(rpcErr),
        });
      }

      // Create the integration row (linked to the app).
      const { data: integration, error: integrationErr } = await this.supabase
        .from("integrations")
        .insert({
          workspace_id: input.workspaceId,
          app_id: input.data.appId,
          connector_key: app.connector_key ?? app.slug,
          name: app.name,
          status: "disconnected",
          auth_type: app.auth_type,
          installed_by: input.userId,
          capabilities: app.capabilities,
        } as never)
        .select()
        .single();
      if (integrationErr) throw toDbError(integrationErr, "marketplace.installApp: create integration failed");
      const integrationId = (integration as unknown as { id: string }).id;

      // Insert the installed_apps row (replaces a previously-uninstalled row).
      await this.supabase
        .from("installed_apps")
        .delete()
        .eq("workspace_id", input.workspaceId)
        .eq("app_id", input.data.appId);

      const row: TablesInsert<"installed_apps"> = {
        workspace_id: input.workspaceId,
        app_id: input.data.appId,
        integration_id: integrationId,
        status: "installed",
        installed_version: input.data.version ?? app.version,
        config: (input.data.config ?? {}) as unknown as TablesInsert<"installed_apps">["config"],
        permissions_granted: (input.data.permissionsGranted ?? []) as unknown as TablesInsert<"installed_apps">["permissions_granted"],
        installed_by: input.userId,
      };
      const { data: installed, error: installedErr } = await this.supabase
        .from("installed_apps")
        .insert(row as never)
        .select()
        .single();
      if (installedErr) throw toDbError(installedErr, "marketplace.installApp: create installed_apps failed");
      return installed as unknown as InstalledApp;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError || err instanceof ValidationError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure installing app.", {
        workspaceId: input.workspaceId,
        appId: input.data.appId,
      });
    }
  }

  /**
   * Uninstall an app from a workspace. Marks the installed_apps row
   * `uninstalled` (preserved for history) and deletes the linked
   * integration (cascades to credentials).
   */
  async uninstallApp(input: {
    installedAppId: string;
    userId: string;
  }): Promise<void> {
    try {
      const { data: row, error } = await this.supabase
        .from("installed_apps")
        .select("integration_id")
        .eq("id", input.installedAppId)
        .maybeSingle();
      if (error) throw toDbError(error, "marketplace.uninstallApp: lookup failed");
      const installed = row as unknown as { integration_id: string | null } | null;
      if (!installed) throw new NotFoundError("InstalledApp", input.installedAppId);

      // Mark uninstalled (preserve the row for history).
      const { error: updateErr } = await this.supabase
        .from("installed_apps")
        .update({
          status: "uninstalled",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", input.installedAppId);
      if (updateErr) throw toDbError(updateErr, "marketplace.uninstallApp: update failed");

      // Delete the linked integration (cascades to credentials, logs, etc.).
      if (installed.integration_id) {
        await this.supabase
          .from("integrations")
          .delete()
          .eq("id", installed.integration_id);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure uninstalling app.", {
        installedAppId: input.installedAppId,
      });
    }
  }

  /**
   * List installed apps for a workspace (newest first).
   */
  async listInstalled(input: {
    workspaceId: string;
    status?: InstalledApp["status"];
  }): Promise<InstalledApp[]> {
    try {
      let query = this.supabase
        .from("installed_apps")
        .select()
        .eq("workspace_id", input.workspaceId)
        .order("installed_at", { ascending: false });
      if (input.status) query = query.eq("status", input.status);
      const { data, error } = await query;
      if (error) throw toDbError(error, "marketplace.listInstalled failed");
      return (data ?? []) as unknown as InstalledApp[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing installed apps.", {
        workspaceId: input.workspaceId,
      });
    }
  }

  /**
   * Check for updates: for each installed app, compare its
   * `installed_version` with the app's `version`. Returns one row per
   * installed app.
   */
  async checkForUpdates(workspaceId: string): Promise<AppUpdateInfo[]> {
    try {
      const { data: installed, error } = await this.supabase
        .from("installed_apps")
        .select("id, app_id, installed_version")
        .eq("workspace_id", workspaceId)
        .eq("status", "installed");
      if (error) throw toDbError(error, "marketplace.checkForUpdates: list installed failed");
      if (!installed || installed.length === 0) return [];

      const appIds = (installed as unknown as Array<{ app_id: string }>).map((r) => r.app_id);
      const { data: apps, error: appsErr } = await this.supabase
        .from("marketplace_apps")
        .select("id, slug, name, version")
        .in("id", appIds);
      if (appsErr) throw toDbError(appsErr, "marketplace.checkForUpdates: list apps failed");
      const appById = new Map<string, { id: string; slug: string; name: string; version: string }>();
      for (const a of (apps ?? []) as unknown as Array<{ id: string; slug: string; name: string; version: string }>) {
        appById.set(a.id, a);
      }

      const out: AppUpdateInfo[] = [];
      for (const inst of installed as unknown as Array<{
        id: string;
        app_id: string;
        installed_version: string | null;
      }>) {
        const app = appById.get(inst.app_id);
        if (!app) continue;
        const latestVersion = app.version;
        const currentVersion = inst.installed_version ?? null;
        out.push({
          appId: app.id,
          slug: app.slug,
          name: app.name,
          currentVersion,
          latestVersion,
          updateAvailable: currentVersion !== null && currentVersion !== latestVersion,
        });
      }
      return out;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure checking for updates.", { workspaceId });
    }
  }

  // -----------------------------------------------------------------------
  // Reviews
  // -----------------------------------------------------------------------

  /**
   * List reviews for an app (newest first).
   */
  async listReviews(appId: string, limit = DEFAULT_REVIEWS_LIMIT, offset = 0): Promise<AppReview[]> {
    const safeLimit = Math.max(1, Math.min(limit, MAX_REVIEWS_LIMIT));
    try {
      const { data, error } = await this.supabase
        .from("app_reviews")
        .select()
        .eq("app_id", appId)
        .order("created_at", { ascending: false })
        .range(offset, offset + safeLimit - 1);
      if (error) throw toDbError(error, "marketplace.listReviews failed");
      return (data ?? []) as unknown as AppReview[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing reviews.", { appId });
    }
  }

  /**
   * Create a review for an app. The caller's `userId` is recorded.
   * When `rating` is supplied (1-5), also upserts an `app_ratings`
   * row + calls `recalc_app_rating` to refresh the app's `rating_avg`
   * + `rating_count`.
   */
  async createReview(input: {
    userId: string;
    workspaceId?: string;
    data: CreateReviewInput;
  }): Promise<AppReview> {
    if (!input.data.appId?.trim()) throw new ValidationError("`appId` is required.");
    if (input.data.rating !== undefined && (input.data.rating < 1 || input.data.rating > 5)) {
      throw new ValidationError("`rating` must be between 1 and 5.");
    }
    try {
      const row: TablesInsert<"app_reviews"> = {
        app_id: input.data.appId,
        workspace_id: input.workspaceId ?? null,
        user_id: input.userId,
        author_name: input.data.authorName ?? null,
        title: input.data.title ?? null,
        body: input.data.body ?? null,
      };
      const { data, error } = await this.supabase
        .from("app_reviews")
        .upsert(row as never, { onConflict: "app_id,user_id" })
        .select()
        .single();
      if (error) throw toDbError(error, "marketplace.createReview failed");
      const review = data as unknown as AppReview;

      if (input.data.rating !== undefined) {
        try {
          await this.supabase
            .from("app_ratings")
            .upsert({
              app_id: input.data.appId,
              user_id: input.userId,
              rating: input.data.rating,
            } as never, { onConflict: "app_id,user_id" });
          await this.supabase.rpc("recalc_app_rating" as never, { target_app_id: input.data.appId } as never);
        } catch (ratingErr) {
          logger.warn("marketplace.createReview: rating upsert failed", {
            appId: input.data.appId,
            error: String(ratingErr),
          });
        }
      }
      return review;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure creating review.", { appId: input.data.appId });
    }
  }

  /**
   * Delete a review (owner-only).
   */
  async deleteReview(input: {
    reviewId: string;
    userId: string;
  }): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("app_reviews")
        .delete()
        .eq("id", input.reviewId)
        .eq("user_id", input.userId);
      if (error) throw toDbError(error, "marketplace.deleteReview failed");
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure deleting review.", { reviewId: input.reviewId });
    }
  }

  /**
   * Rate an app (1-5). Upserts an `app_ratings` row + calls the
   * `recalc_app_rating` RPC to refresh the app's averages.
   */
  async rateApp(input: {
    appId: string;
    userId: string;
    rating: number;
  }): Promise<AppRating> {
    if (input.rating < 1 || input.rating > 5) {
      throw new ValidationError("`rating` must be between 1 and 5.");
    }
    try {
      const { data, error } = await this.supabase
        .from("app_ratings")
        .upsert({
          app_id: input.appId,
          user_id: input.userId,
          rating: input.rating,
        } as never, { onConflict: "app_id,user_id" })
        .select()
        .single();
      if (error) throw toDbError(error, "marketplace.rateApp failed");
      try {
        await this.supabase.rpc("recalc_app_rating" as never, { target_app_id: input.appId } as never);
      } catch (rpcErr) {
        logger.warn("marketplace.rateApp: recalc RPC failed", {
          appId: input.appId,
          error: String(rpcErr),
        });
      }
      return data as unknown as AppRating;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure rating app.", { appId: input.appId });
    }
  }

  // -----------------------------------------------------------------------
  // Versions
  // -----------------------------------------------------------------------

  /**
   * List versions for an app (newest first).
   */
  async listVersions(appId: string): Promise<IntegrationVersion[]> {
    try {
      const { data, error } = await this.supabase
        .from("integration_versions")
        .select()
        .eq("app_id", appId)
        .order("created_at", { ascending: false });
      if (error) throw toDbError(error, "marketplace.listVersions failed");
      return (data ?? []) as unknown as IntegrationVersion[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing versions.", { appId });
    }
  }

  /**
   * Publish a new version for an app. Marks the previous latest
   * version as no-longer-latest + the new one as `is_latest`.
   */
  async publishVersion(input: {
    appId: string;
    userId: string;
    data: PublishVersionInput;
  }): Promise<IntegrationVersion> {
    if (!input.data.version?.trim()) throw new ValidationError("`version` is required.");
    try {
      // Demote previous latest.
      await this.supabase
        .from("integration_versions")
        .update({ is_latest: false } as never)
        .eq("app_id", input.appId)
        .eq("is_latest", true);

      const row: TablesInsert<"integration_versions"> = {
        app_id: input.appId,
        version: input.data.version,
        changelog: input.data.changelog ?? null,
        is_latest: true,
        is_breaking: input.data.isBreaking ?? false,
        migration_script: input.data.migrationScript ?? null,
        published_at: new Date().toISOString(),
        created_by: input.userId,
      };
      const { data, error } = await this.supabase
        .from("integration_versions")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "marketplace.publishVersion failed");

      // Bump the app's `version` column to the new version.
      await this.supabase
        .from("marketplace_apps")
        .update({ version: input.data.version } as never)
        .eq("id", input.appId);

      return data as unknown as IntegrationVersion;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure publishing version.", {
        appId: input.appId,
        version: input.data.version,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Publisher profile
  // -----------------------------------------------------------------------

  /**
   * Get a publisher's public profile: published apps + aggregate
   * install count.
   */
  async getPublisherProfile(publisherName: string): Promise<{
    publisherName: string;
    apps: MarketplaceApp[];
    totalInstalls: number;
    totalRatings: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .from("marketplace_apps")
        .select()
        .eq("publisher_name", publisherName)
        .eq("is_published", true)
        .order("install_count", { ascending: false });
      if (error) throw toDbError(error, "marketplace.getPublisherProfile failed");
      const apps = (data ?? []) as unknown as MarketplaceApp[];
      return {
        publisherName,
        apps,
        totalInstalls: apps.reduce((s, a) => s + a.install_count, 0),
        totalRatings: apps.reduce((s, a) => s + a.rating_count, 0),
      };
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching publisher profile.", { publisherName });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton + DI
// ---------------------------------------------------------------------------

let _svc: MarketplaceService | null = null;

/** Get the shared marketplace service (singleton). */
export function getMarketplaceService(): MarketplaceService {
  if (_svc) return _svc;
  _svc = new MarketplaceService(createSupabaseAdminClient());
  return _svc;
}

/** Get a marketplace service bound to a specific admin client (tests / DI). */
export function getMarketplaceServiceWith(supabase: AdminSupabaseClient): MarketplaceService {
  return new MarketplaceService(supabase);
}

// Re-export the analytics type for callers that want it in one place.
export type { IntegrationAnalytics };
