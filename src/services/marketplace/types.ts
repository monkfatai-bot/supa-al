/**
 * Marketplace Service Types
 *
 * Type definitions for the general marketplace service that supports
 * browsing, publishing, and managing marketplace items including
 * AI employees, workflow templates, prompt packs, and extensions.
 */

import type {
  Json,
  MarketplaceItem,
  MarketplaceCategory,
  MarketplaceReview,
  InstalledExtension,
  MarketplaceItemType,
  MarketplaceItemStatus,
  PricingType,
  ExtensionStatus,
  Profile,
} from "@/types/generated/database";

// ─── Request / Option Types ───────────────────────────────────

export interface ListMarketplaceItemsOptions {
  type?: MarketplaceItemType;
  category?: string;
  search?: string;
  status?: MarketplaceItemStatus;
  sort?: "rating" | "install_count" | "created_at" | "name";
  limit?: number;
  offset?: number;
}

export interface CreateMarketplaceItemRequest {
  workspaceId: string;
  name: string;
  description: string;
  type: MarketplaceItemType;
  categoryId?: string;
  features?: string[];
  pricingType: PricingType;
  price?: number;
  iconUrl?: string;
  screenshots?: string[];
}

export interface UpdateMarketplaceItemRequest {
  workspaceId: string;
  itemId: string;
  updates: Partial<{
    name: string;
    description: string;
    type: MarketplaceItemType;
    categoryId: string | null;
    features: string[];
    pricingType: PricingType;
    price: number;
    iconUrl: string;
    screenshots: string[];
    metadata: Json;
  }>;
}

export interface SearchMarketplaceOptions {
  query: string;
  type?: MarketplaceItemType;
  category?: string;
  limit?: number;
}

export interface CreateReviewRequest {
  workspaceId: string;
  itemId: string;
  rating: number;
  title?: string;
  comment?: string;
}

export interface UpdateInstalledExtensionRequest {
  workspaceId: string;
  itemId: string;
  config?: Json;
  status?: ExtensionStatus;
}

export interface ListSdkPackagesOptions {
  status?: string;
}

export interface CreateSdkPackageRequest {
  name: string;
  description?: string;
  version: string;
  author?: string;
  manifest: Record<string, unknown>;
}

// ─── Enriched / Composite Types ───────────────────────────────

export interface MarketplaceItemWithAuthor extends MarketplaceItem {
  author?: Profile | null;
  category?: MarketplaceCategory | null;
}

export interface InstalledExtensionWithItem extends InstalledExtension {
  item?: MarketplaceItem | null;
}

export interface ReviewWithUser extends MarketplaceReview {
  user?: Profile | null;
}

export interface CategoryWithCount extends MarketplaceCategory {
  item_count: number;
}

// ─── Response Types ────────────────────────────────────────────

export interface MarketplaceActionResponse {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

export interface PaginatedMarketplaceResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  total?: number;
  error?: string;
}
