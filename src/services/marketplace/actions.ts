"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { verifyWorkspaceMembership, requireMinimumRole } from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import { PAGINATION } from "@/config/constants";
import type {
  MarketplaceItem,
  MarketplaceCategory,
  ExtensionVersion,
  MarketplaceItemType,
  MarketplaceItemStatus,
  ExtensionStatus,
  Json,
} from "@/types/generated/database";
import type {
  MarketplaceActionResponse,
  PaginatedMarketplaceResponse,
  ListMarketplaceItemsOptions,
  CreateMarketplaceItemRequest,
  UpdateMarketplaceItemRequest,
  SearchMarketplaceOptions,
  CreateReviewRequest,
  UpdateInstalledExtensionRequest,
  MarketplaceItemWithAuthor,
  InstalledExtensionWithItem,
  ReviewWithUser,
  CategoryWithCount,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeResponse(
  success: boolean,
  message: string,
  data?: unknown,
  error?: string
): MarketplaceActionResponse {
  return { success, message, data, error };
}

// ═══════════════════════════════════════════════════════════════
// 1. LIST MARKETPLACE ITEMS
// ═══════════════════════════════════════════════════════════════

export async function listMarketplaceItems(
  options?: ListMarketplaceItemsOptions
): Promise<PaginatedMarketplaceResponse<MarketplaceItem>> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const limit = Math.min(options?.limit ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
  const offset = options?.offset ?? 0;
  const status = options?.status ?? ("published" as MarketplaceItemStatus);

  let query = supabase
    .from("marketplace_items")
    .select("*", { count: "exact" })
    .eq("status", status);

  if (options?.type) {
    query = query.eq("type", options.type);
  }
  if (options?.category) {
    query = query.eq("category_id", options.category);
  }
  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`);
  }

  const sortColumn = options?.sort ?? "created_at";
  const ascending = sortColumn === "name";
  query = query.order(sortColumn, { ascending }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to list marketplace items", { userId: profile.id, reason: error.message });
    return { success: false, message: "Failed to fetch marketplace items.", data: [], error: error.message };
  }

  return { success: true, message: "Items fetched.", data: (data as MarketplaceItem[]) ?? [], total: count ?? 0 };
}

// ═══════════════════════════════════════════════════════════════
// 2. GET MARKETPLACE ITEM
// ═══════════════════════════════════════════════════════════════

export async function getMarketplaceItem(
  slug: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: item, error } = await supabase
    .from("marketplace_items")
    .select("*, author:profiles!author_id(id, full_name, avatar_url, username), category:marketplace_categories(*)")
    .eq("slug", slug)
    .single();

  if (error || !item) {
    logger.error("Failed to get marketplace item", { slug, userId: profile.id, reason: error?.message });
    return makeResponse(false, "Item not found.", undefined, "NOT_FOUND");
  }

  return makeResponse(true, "Item fetched.", item as unknown as MarketplaceItemWithAuthor);
}

// ═══════════════════════════════════════════════════════════════
// 3. CREATE MARKETPLACE ITEM
// ═══════════════════════════════════════════════════════════════

export async function createMarketplaceItem(
  data: CreateMarketplaceItemRequest
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await requireMinimumRole(data.workspaceId, profile.id, "member");

  const slug = slugify(data.name);

  // Ensure slug is unique
  const { data: existing } = await supabase
    .from("marketplace_items")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    return makeResponse(false, "An item with a similar name already exists.", undefined, "DUPLICATE_SLUG");
  }

  const { data: item, error } = await supabase
    .from("marketplace_items")
    .insert({
      name: data.name,
      slug,
      description: data.description,
      type: data.type,
      category_id: data.categoryId ?? null,
      author_id: profile.id,
      features: data.features ?? [],
      pricing_type: data.pricingType,
      price: data.price ?? 0,
      icon_url: data.iconUrl ?? null,
      screenshots: (data.screenshots ?? []) as unknown as Json,
      status: "draft" as MarketplaceItemStatus,
      rating: 0,
      review_count: 0,
      install_count: 0,
      version: "1.0.0",
      is_featured: false,
      metadata: {},
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to create marketplace item", { userId: profile.id, reason: error.message });
    return makeResponse(false, "Failed to create item.", undefined, "INSERT_FAILED");
  }

  revalidatePath("/marketplace");
  return makeResponse(true, "Item created as draft.", item);
}

// ═══════════════════════════════════════════════════════════════
// 4. UPDATE MARKETPLACE ITEM
// ═══════════════════════════════════════════════════════════════

export async function updateMarketplaceItem(
  data: UpdateMarketplaceItemRequest
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await requireMinimumRole(data.workspaceId, profile.id, "member");

  // Verify ownership
  const { data: existing } = await supabase
    .from("marketplace_items")
    .select("id, author_id")
    .eq("id", data.itemId)
    .single();

  if (!existing) {
    return makeResponse(false, "Item not found.", undefined, "NOT_FOUND");
  }
  if (existing.author_id !== profile.id) {
    return makeResponse(false, "You can only edit your own items.", undefined, "FORBIDDEN");
  }

  const updates: Record<string, unknown> = { ...data.updates };
  if (updates.name) {
    updates.slug = slugify(updates.name as string);
  }

  const { error } = await supabase
    .from("marketplace_items")
    .update(updates)
    .eq("id", data.itemId);

  if (error) {
    logger.error("Failed to update marketplace item", { itemId: data.itemId, reason: error.message });
    return makeResponse(false, "Failed to update item.", undefined, "UPDATE_FAILED");
  }

  revalidatePath("/marketplace");
  return makeResponse(true, "Item updated.");
}

// ═══════════════════════════════════════════════════════════════
// 5. PUBLISH MARKETPLACE ITEM
// ═══════════════════════════════════════════════════════════════

export async function publishMarketplaceItem(
  workspaceId: string,
  itemId: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await requireMinimumRole(workspaceId, profile.id, "member");

  const { data: existing } = await supabase
    .from("marketplace_items")
    .select("id, author_id, status")
    .eq("id", itemId)
    .single();

  if (!existing) {
    return makeResponse(false, "Item not found.", undefined, "NOT_FOUND");
  }
  if (existing.author_id !== profile.id) {
    return makeResponse(false, "You can only publish your own items.", undefined, "FORBIDDEN");
  }

  const { error } = await supabase
    .from("marketplace_items")
    .update({
      status: "published" as MarketplaceItemStatus,
      published_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    logger.error("Failed to publish marketplace item", { itemId, reason: error.message });
    return makeResponse(false, "Failed to publish item.", undefined, "UPDATE_FAILED");
  }

  revalidatePath("/marketplace");
  return makeResponse(true, "Item published.");
}

// ═══════════════════════════════════════════════════════════════
// 6. UNPUBLISH MARKETPLACE ITEM
// ═══════════════════════════════════════════════════════════════

export async function unpublishMarketplaceItem(
  workspaceId: string,
  itemId: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await requireMinimumRole(workspaceId, profile.id, "member");

  const { data: existing } = await supabase
    .from("marketplace_items")
    .select("id, author_id")
    .eq("id", itemId)
    .single();

  if (!existing) {
    return makeResponse(false, "Item not found.", undefined, "NOT_FOUND");
  }
  if (existing.author_id !== profile.id) {
    return makeResponse(false, "Access denied.", undefined, "FORBIDDEN");
  }

  const { error } = await supabase
    .from("marketplace_items")
    .update({ status: "draft" as MarketplaceItemStatus })
    .eq("id", itemId);

  if (error) {
    logger.error("Failed to unpublish marketplace item", { itemId, reason: error.message });
    return makeResponse(false, "Failed to unpublish item.", undefined, "UPDATE_FAILED");
  }

  revalidatePath("/marketplace");
  return makeResponse(true, "Item unpublished.");
}

// ═══════════════════════════════════════════════════════════════
// 7. DELETE MARKETPLACE ITEM (soft delete → archived)
// ═══════════════════════════════════════════════════════════════

export async function deleteMarketplaceItem(
  workspaceId: string,
  itemId: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await requireMinimumRole(workspaceId, profile.id, "admin");

  const { error } = await supabase
    .from("marketplace_items")
    .update({ status: "archived" as MarketplaceItemStatus })
    .eq("id", itemId);

  if (error) {
    logger.error("Failed to archive marketplace item", { itemId, reason: error.message });
    return makeResponse(false, "Failed to delete item.", undefined, "DELETE_FAILED");
  }

  revalidatePath("/marketplace");
  return makeResponse(true, "Item archived.");
}

// ═══════════════════════════════════════════════════════════════
// 8. SEARCH MARKETPLACE
// ═══════════════════════════════════════════════════════════════

export async function searchMarketplace(
  options: SearchMarketplaceOptions
): Promise<PaginatedMarketplaceResponse<MarketplaceItem>> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const limit = Math.min(options.limit ?? 20, PAGINATION.MAX_PAGE_SIZE);

  let query = supabase
    .from("marketplace_items")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .or(`name.ilike.%${options.query}%,description.ilike.%${options.query}%`);

  if (options.type) {
    query = query.eq("type", options.type);
  }
  if (options.category) {
    query = query.eq("category_id", options.category);
  }

  query = query.order("rating", { ascending: false }).limit(limit);

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to search marketplace", { query: options.query, reason: error.message });
    return { success: false, message: "Search failed.", data: [], error: error.message };
  }

  return {
    success: true,
    message: "Search results.",
    data: (data as MarketplaceItem[]) ?? [],
    total: count ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// 9. GET CATEGORIES
// ═══════════════════════════════════════════════════════════════

export async function getCategories(): Promise<MarketplaceActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: categories, error } = await supabase
    .from("marketplace_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    logger.error("Failed to fetch categories", { reason: error.message });
    return makeResponse(false, "Failed to fetch categories.", undefined, "FETCH_FAILED");
  }

  // Fetch item counts per category
  const cats = (categories ?? []) as MarketplaceCategory[];
  if (cats.length === 0) {
    return makeResponse(true, "Categories fetched.", []);
  }

  const categoryIds = cats.map((c) => c.id);
  const { data: items } = await supabase
    .from("marketplace_items")
    .select("category_id")
    .eq("status", "published")
    .in("category_id", categoryIds);

  const counts: Record<string, number> = {};
  for (const item of items ?? []) {
    if (item.category_id) {
      counts[item.category_id] = (counts[item.category_id] ?? 0) + 1;
    }
  }

  const withCounts: CategoryWithCount[] = cats.map((cat) => ({
    ...cat,
    item_count: counts[cat.id] ?? 0,
  }));

  return makeResponse(true, "Categories fetched.", withCounts);
}

// ═══════════════════════════════════════════════════════════════
// 10. INSTALL EXTENSION
// ═══════════════════════════════════════════════════════════════

export async function installExtension(
  workspaceId: string,
  itemId: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await verifyWorkspaceMembership(workspaceId, profile.id);

  // Check if already installed
  const { data: existing } = await supabase
    .from("installed_extensions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("item_id", itemId)
    .single();

  if (existing) {
    return makeResponse(false, "Extension is already installed.", undefined, "ALREADY_INSTALLED");
  }

  // Get current version and install count
  const { data: item } = await supabase
    .from("marketplace_items")
    .select("version, install_count")
    .eq("id", itemId)
    .single();

  if (!item) {
    return makeResponse(false, "Item not found.", undefined, "NOT_FOUND");
  }

  // Create installed_extensions record
  const { error: installError } = await supabase.from("installed_extensions").insert({
    workspace_id: workspaceId,
    item_id: itemId,
    version: item.version,
    status: "active" as ExtensionStatus,
    config: {},
    installed_by: profile.id,
  });

  if (installError) {
    logger.error("Failed to install extension", { itemId, workspaceId, reason: installError.message });
    return makeResponse(false, "Failed to install extension.", undefined, "INSTALL_FAILED");
  }

  // Increment install_count atomically
  try {
    await supabase.rpc("increment_install_count", { item_id: itemId });
  } catch {
    // Fallback: manual increment
    await supabase
      .from("marketplace_items")
      .update({ install_count: (item.install_count ?? 0) + 1 })
      .eq("id", itemId);
  }

  revalidatePath("/marketplace");
  return makeResponse(true, "Extension installed.");
}

// ═══════════════════════════════════════════════════════════════
// 11. UNINSTALL EXTENSION
// ═══════════════════════════════════════════════════════════════

export async function uninstallExtension(
  workspaceId: string,
  itemId: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await verifyWorkspaceMembership(workspaceId, profile.id);

  const { error } = await supabase
    .from("installed_extensions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("item_id", itemId);

  if (error) {
    logger.error("Failed to uninstall extension", { itemId, workspaceId, reason: error.message });
    return makeResponse(false, "Failed to uninstall extension.", undefined, "DELETE_FAILED");
  }

  revalidatePath("/marketplace");
  return makeResponse(true, "Extension uninstalled.");
}

// ═══════════════════════════════════════════════════════════════
// 12. LIST INSTALLED EXTENSIONS
// ═══════════════════════════════════════════════════════════════

export async function listInstalledExtensions(
  workspaceId: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await verifyWorkspaceMembership(workspaceId, profile.id);

  const { data, error } = await supabase
    .from("installed_extensions")
    .select("*, item:marketplace_items(*)")
    .eq("workspace_id", workspaceId)
    .order("installed_at", { ascending: false });

  if (error) {
    logger.error("Failed to list installed extensions", { workspaceId, reason: error.message });
    return makeResponse(false, "Failed to fetch installed extensions.", undefined, "FETCH_FAILED");
  }

  return makeResponse(true, "Installed extensions fetched.", data as unknown as InstalledExtensionWithItem[]);
}

// ═══════════════════════════════════════════════════════════════
// 13. UPDATE INSTALLED EXTENSION
// ═══════════════════════════════════════════════════════════════

export async function updateInstalledExtension(
  data: UpdateInstalledExtensionRequest
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await verifyWorkspaceMembership(data.workspaceId, profile.id);

  const updates: Record<string, unknown> = {};
  if (data.config !== undefined) updates.config = data.config;
  if (data.status !== undefined) updates.status = data.status;

  if (Object.keys(updates).length === 0) {
    return makeResponse(false, "No updates provided.", undefined, "BAD_REQUEST");
  }

  const { error } = await supabase
    .from("installed_extensions")
    .update(updates)
    .eq("workspace_id", data.workspaceId)
    .eq("item_id", data.itemId);

  if (error) {
    logger.error("Failed to update installed extension", {
      workspaceId: data.workspaceId,
      itemId: data.itemId,
      reason: error.message,
    });
    return makeResponse(false, "Failed to update extension.", undefined, "UPDATE_FAILED");
  }

  return makeResponse(true, "Extension updated.");
}

// ═══════════════════════════════════════════════════════════════
// 14. GET INSTALLED EXTENSION
// ═══════════════════════════════════════════════════════════════

export async function getInstalledExtension(
  workspaceId: string,
  itemId: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await verifyWorkspaceMembership(workspaceId, profile.id);

  const { data, error } = await supabase
    .from("installed_extensions")
    .select("*, item:marketplace_items(*)")
    .eq("workspace_id", workspaceId)
    .eq("item_id", itemId)
    .single();

  if (error || !data) {
    logger.error("Failed to get installed extension", { workspaceId, itemId, reason: error?.message });
    return makeResponse(false, "Extension not found.", undefined, "NOT_FOUND");
  }

  return makeResponse(true, "Extension fetched.", data as unknown as InstalledExtensionWithItem);
}

// ═══════════════════════════════════════════════════════════════
// 15. CREATE / UPDATE REVIEW
// ═══════════════════════════════════════════════════════════════

export async function createReview(
  data: CreateReviewRequest
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await verifyWorkspaceMembership(data.workspaceId, profile.id);

  if (data.rating < 1 || data.rating > 5) {
    return makeResponse(false, "Rating must be between 1 and 5.", undefined, "INVALID_RATING");
  }

  // Upsert: check for existing review
  const { data: existingReview } = await supabase
    .from("marketplace_reviews")
    .select("id, rating")
    .eq("item_id", data.itemId)
    .eq("user_id", profile.id)
    .single();

  if (existingReview) {
    // Update existing review
    const { error } = await supabase
      .from("marketplace_reviews")
      .update({
        rating: data.rating,
        title: data.title ?? null,
        comment: data.comment ?? null,
      })
      .eq("id", existingReview.id);

    if (error) {
      logger.error("Failed to update review", { reason: error.message });
      return makeResponse(false, "Failed to update review.", undefined, "UPDATE_FAILED");
    }

    // Recalculate rating
    await recalculateItemRating(data.itemId, supabase);
    return makeResponse(true, "Review updated.");
  }

  // Create new review
  const { error } = await supabase.from("marketplace_reviews").insert({
    item_id: data.itemId,
    user_id: profile.id,
    workspace_id: data.workspaceId,
    rating: data.rating,
    title: data.title ?? null,
    comment: data.comment ?? null,
    status: "published",
  });

  if (error) {
    logger.error("Failed to create review", { reason: error.message });
    return makeResponse(false, "Failed to create review.", undefined, "INSERT_FAILED");
  }

  await recalculateItemRating(data.itemId, supabase);
  revalidatePath("/marketplace");
  return makeResponse(true, "Review submitted.");
}

async function recalculateItemRating(
  itemId: string,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
): Promise<void> {
  const { data: reviews } = await supabase
    .from("marketplace_reviews")
    .select("rating")
    .eq("item_id", itemId);

  if (!reviews || reviews.length === 0) return;

  const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  const avgRating = Math.round((totalRating / reviews.length) * 100) / 100;

  await supabase
    .from("marketplace_items")
    .update({
      rating: avgRating,
      review_count: reviews.length,
    })
    .eq("id", itemId);
}

// ═══════════════════════════════════════════════════════════════
// 16. GET REVIEWS
// ═══════════════════════════════════════════════════════════════

export async function getReviews(
  itemId: string,
  limit?: number,
  offset?: number
): Promise<MarketplaceActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const take = Math.min(limit ?? 20, PAGINATION.MAX_PAGE_SIZE);
  const skip = offset ?? 0;

  const { data, error } = await supabase
    .from("marketplace_reviews")
    .select("*, user:profiles!user_id(id, full_name, avatar_url, username)")
    .eq("item_id", itemId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(skip, skip + take - 1);

  if (error) {
    logger.error("Failed to fetch reviews", { itemId, reason: error.message });
    return makeResponse(false, "Failed to fetch reviews.", undefined, "FETCH_FAILED");
  }

  return makeResponse(true, "Reviews fetched.", data as unknown as ReviewWithUser[]);
}

// ═══════════════════════════════════════════════════════════════
// 17. TOGGLE FAVORITE
// ═══════════════════════════════════════════════════════════════

export async function toggleFavorite(
  workspaceId: string,
  itemId: string
): Promise<MarketplaceActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  await verifyWorkspaceMembership(workspaceId, profile.id);

  // Check if installed with 'favorite' config
  const { data: existing } = await supabase
    .from("installed_extensions")
    .select("id, config")
    .eq("workspace_id", workspaceId)
    .eq("item_id", itemId)
    .single();

  if (existing) {
    const currentConfig = (existing.config as Record<string, unknown>) ?? {};
    const isFavorite = currentConfig.favorite === true;

    const { error } = await supabase
      .from("installed_extensions")
      .update({ config: { ...currentConfig, favorite: !isFavorite } as unknown as Json })
      .eq("id", existing.id);

    if (error) {
      logger.error("Failed to toggle favorite", { reason: error.message });
      return makeResponse(false, "Failed to toggle favorite.", undefined, "UPDATE_FAILED");
    }

    return makeResponse(true, isFavorite ? "Removed from favorites." : "Added to favorites.");
  }

  // Not installed yet — create a minimal record as a favorite
  const { data: item } = await supabase
    .from("marketplace_items")
    .select("version")
    .eq("id", itemId)
    .single();

  if (!item) {
    return makeResponse(false, "Item not found.", undefined, "NOT_FOUND");
  }

  const { error } = await supabase.from("installed_extensions").insert({
    workspace_id: workspaceId,
    item_id: itemId,
    version: item.version,
    status: "inactive" as ExtensionStatus,
    config: { favorite: true } as unknown as Json,
    installed_by: profile.id,
  });

  if (error) {
    logger.error("Failed to create favorite", { reason: error.message });
    return makeResponse(false, "Failed to add favorite.", undefined, "INSERT_FAILED");
  }

  return makeResponse(true, "Added to favorites.");
}

// ═══════════════════════════════════════════════════════════════
// 18. GET FEATURED ITEMS
// ═══════════════════════════════════════════════════════════════

export async function getFeaturedItems(
  type?: MarketplaceItemType
): Promise<PaginatedMarketplaceResponse<MarketplaceItem>> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("marketplace_items")
    .select("*", { count: "exact" })
    .eq("is_featured", true)
    .eq("status", "published");

  if (type) {
    query = query.eq("type", type);
  }

  query = query.order("rating", { ascending: false }).limit(20);

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch featured items", { reason: error.message });
    return { success: false, message: "Failed to fetch featured items.", data: [], error: error.message };
  }

  return {
    success: true,
    message: "Featured items fetched.",
    data: (data as MarketplaceItem[]) ?? [],
    total: count ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// 19. GET VERSION HISTORY
// ═══════════════════════════════════════════════════════════════

export async function getVersionHistory(
  itemId: string
): Promise<MarketplaceActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("extension_versions")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch version history", { itemId, reason: error.message });
    return makeResponse(false, "Failed to fetch version history.", undefined, "FETCH_FAILED");
  }

  return makeResponse(true, "Version history fetched.", data as unknown as ExtensionVersion[]);
}
