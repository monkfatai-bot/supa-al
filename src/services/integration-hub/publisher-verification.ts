"use server";

/**
 * Category 19 — Marketplace Publisher Verification
 *
 * Manages publisher profiles, verification workflows, ratings,
 * and analytics for marketplace publishers.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServiceClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import type { ServiceResult } from "./types";

// ─── Local types ────────────────────────────────────────────────

interface PublisherProfile {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website_url: string | null;
  logo_url: string | null;
  owner_id: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface PublisherStats {
  rating: number | null;
  reviewCount: number;
  totalInstalls: number;
  totalItems: number;
}

interface PublisherWithStats extends PublisherProfile, PublisherStats {}

interface VerificationRequest {
  id: string;
  publisher_id: string;
  status: "pending" | "approved" | "rejected";
  evidence: Record<string, unknown>;
  reviewed_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface CreatePublisherData {
  name: string;
  slug: string;
  description?: string;
  websiteUrl?: string;
  logoUrl?: string;
}

interface UpdatePublisherData {
  name?: string;
  description?: string;
  websiteUrl?: string;
  logoUrl?: string;
}

interface ListPublishersFilter {
  search?: string;
  verifiedOnly?: boolean;
  limit?: number;
  offset?: number;
}

// ─── createPublisherProfile ──────────────────────────────────────

export async function createPublisherProfile(
  data: CreatePublisherData
): Promise<ServiceResult<PublisherProfile>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Check slug uniqueness
    const { data: existing } = await supabase
      .from("publishers")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        message: "Publisher slug is already taken.",
        error: "SLUG_NOT_UNIQUE",
      };
    }

    const { data: publisher, error } = await supabase
      .from("publishers")
      .insert({
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        website_url: data.websiteUrl ?? null,
        logo_url: data.logoUrl ?? null,
        owner_id: profile.id,
      })
      .select()
      .single();

    if (error || !publisher) {
      logger.error("Failed to create publisher profile", {
        userId: profile.id,
        slug: data.slug,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to create publisher profile.",
        error: error?.message,
      };
    }

    logger.info("Publisher profile created", {
      publisherId: publisher.id,
      slug: data.slug,
      userId: profile.id,
    });

    return {
      success: true,
      message: "Publisher profile created.",
      data: publisher as PublisherProfile,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create publisher profile.";
    return { success: false, message, error: message };
  }
}

// ─── updatePublisherProfile ──────────────────────────────────────

export async function updatePublisherProfile(
  publisherId: string,
  data: UpdatePublisherData
): Promise<ServiceResult<PublisherProfile>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Owner check
    const { data: existing, error: fetchError } = await supabase
      .from("publishers")
      .select("id, owner_id")
      .eq("id", publisherId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        message: "Publisher not found.",
        error: fetchError?.message,
      };
    }

    if (existing.owner_id !== profile.id) {
      return {
        success: false,
        message: "Only the publisher owner can update the profile.",
      };
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.websiteUrl !== undefined) updatePayload.website_url = data.websiteUrl;
    if (data.logoUrl !== undefined) updatePayload.logo_url = data.logoUrl;

    const { data: publisher, error } = await supabase
      .from("publishers")
      .update(updatePayload)
      .eq("id", publisherId)
      .select()
      .single();

    if (error || !publisher) {
      logger.error("Failed to update publisher profile", {
        publisherId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to update publisher profile.",
        error: error?.message,
      };
    }

    logger.info("Publisher profile updated", { publisherId, userId: profile.id });

    return {
      success: true,
      message: "Publisher profile updated.",
      data: publisher as PublisherProfile,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update publisher profile.";
    return { success: false, message, error: message };
  }
}

// ─── getPublisherProfile ─────────────────────────────────────────

export async function getPublisherProfile(
  publisherId: string
): Promise<ServiceResult<PublisherWithStats>> {
  try {
    const supabase = createServiceClient();

    const { data: publisher, error: pubError } = await supabase
      .from("publishers")
      .select("*")
      .eq("id", publisherId)
      .single();

    if (pubError || !publisher) {
      return {
        success: false,
        message: "Publisher not found.",
        error: pubError?.message,
      };
    }

    // Aggregate stats from marketplace_items and publisher_ratings
    const [itemsRes, ratingsRes] = await Promise.all([
      supabase
        .from("marketplace_items")
        .select("id, install_count")
        .eq("publisher_id", publisherId),
      supabase
        .from("publisher_ratings")
        .select("rating")
        .eq("publisher_id", publisherId),
    ]);

    const items = itemsRes.data ?? [];
    const ratings = ratingsRes.data ?? [];

    const totalInstalls = items.reduce((sum, i) => sum + (i.install_count ?? 0), 0);
    const reviewCount = ratings.length;
    const rating =
      reviewCount > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / reviewCount
        : null;

    const result: PublisherWithStats = {
      ...(publisher as unknown as PublisherProfile),
      rating,
      reviewCount,
      totalInstalls,
      totalItems: items.length,
    };

    return {
      success: true,
      message: "Publisher profile retrieved.",
      data: result,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get publisher profile.";
    return { success: false, message, error: message };
  }
}

// ─── listPublishers ─────────────────────────────────────────────

export async function listPublishers(
  filter?: ListPublishersFilter
): Promise<ServiceResult<{ publishers: PublisherProfile[]; total: number }>> {
  try {
    const supabase = createServiceClient();

    const limit = filter?.limit ?? 20;
    const offset = filter?.offset ?? 0;

    let query = supabase
      .from("publishers")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter?.verifiedOnly) {
      query = query.eq("is_verified", true);
    }

    if (filter?.search) {
      query = query.or(
        `name.ilike.%${filter.search}%,slug.ilike.%${filter.search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error("Failed to list publishers", { reason: error.message });
      return {
        success: false,
        message: "Failed to list publishers.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} publishers.`,
      data: {
        publishers: (data ?? []) as PublisherProfile[],
        total: count ?? 0,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list publishers.";
    return { success: false, message, error: message };
  }
}

// ─── submitVerificationRequest ───────────────────────────────────

export async function submitVerificationRequest(
  publisherId: string,
  evidence: Record<string, unknown>
): Promise<ServiceResult<VerificationRequest>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Owner check
    const { data: pub, error: pubError } = await supabase
      .from("publishers")
      .select("id, owner_id")
      .eq("id", publisherId)
      .single();

    if (pubError || !pub) {
      return { success: false, message: "Publisher not found.", error: pubError?.message };
    }

    if (pub.owner_id !== profile.id) {
      return {
        success: false,
        message: "Only the publisher owner can submit verification.",
      };
    }

    const { data: request, error } = await supabase
      .from("publisher_verification_requests")
      .insert({
        publisher_id: publisherId,
        status: "pending",
        evidence,
      })
      .select()
      .single();

    if (error || !request) {
      logger.error("Failed to submit verification request", {
        publisherId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to submit verification request.",
        error: error?.message,
      };
    }

    logger.info("Verification request submitted", {
      requestId: request.id,
      publisherId,
      userId: profile.id,
    });

    return {
      success: true,
      message: "Verification request submitted.",
      data: request as VerificationRequest,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to submit verification request.";
    return { success: false, message, error: message };
  }
}

// ─── reviewVerificationRequest ───────────────────────────────────

export async function reviewVerificationRequest(
  requestId: string,
  decision: "approved" | "rejected",
  rejectionReason?: string
): Promise<ServiceResult<VerificationRequest>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Admin-only check
    if (profile.app_role !== "super_admin" && profile.app_role !== "admin") {
      return {
        success: false,
        message: "Insufficient permissions. Admin required.",
      };
    }

    const { data: request, error: fetchError } = await supabase
      .from("publisher_verification_requests")
      .select("id, publisher_id, status")
      .eq("id", requestId)
      .single();

    if (fetchError || !request) {
      return {
        success: false,
        message: "Verification request not found.",
        error: fetchError?.message,
      };
    }

    if (request.status !== "pending") {
      return {
        success: false,
        message: "This request has already been reviewed.",
      };
    }

    const { data: updated, error } = await supabase
      .from("publisher_verification_requests")
      .update({
        status: decision,
        reviewed_by: profile.id,
        rejection_reason: decision === "rejected" ? (rejectionReason ?? null) : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select()
      .single();

    if (error || !updated) {
      logger.error("Failed to review verification request", {
        requestId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to review verification request.",
        error: error?.message,
      };
    }

    // If approved, mark publisher as verified
    if (decision === "approved") {
      const { error: verifyError } = await supabase
        .from("publishers")
        .update({ is_verified: true, updated_at: new Date().toISOString() })
        .eq("id", request.publisher_id);

      if (verifyError) {
        logger.error("Failed to mark publisher as verified", {
          publisherId: request.publisher_id,
          reason: verifyError.message,
        });
      }
    }

    logger.info("Verification request reviewed", {
      requestId,
      decision,
      reviewedBy: profile.id,
    });

    return {
      success: true,
      message: `Verification request ${decision}.`,
      data: updated as VerificationRequest,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to review verification request.";
    return { success: false, message, error: message };
  }
}

// ─── getPublisherItems ───────────────────────────────────────────

export async function getPublisherItems(
  publisherId: string
): Promise<ServiceResult<Record<string, unknown>[]>> {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("marketplace_items")
      .select("id, name, slug, status, install_count, rating, created_at")
      .eq("publisher_id", publisherId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to get publisher items", {
        publisherId,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get publisher items.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} items.`,
      data: (data ?? []) as Record<string, unknown>[],
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get publisher items.";
    return { success: false, message, error: message };
  }
}

// ─── getPublisherAnalytics ───────────────────────────────────────

export async function getPublisherAnalytics(
  publisherId: string
): Promise<ServiceResult<{
  totalInstalls: number;
  averageRating: number | null;
  totalReviews: number;
  itemsByStatus: Record<string, number>;
}>> {
  try {
    const supabase = createServiceClient();

    const [itemsRes, ratingsRes] = await Promise.all([
      supabase
        .from("marketplace_items")
        .select("id, install_count, status")
        .eq("publisher_id", publisherId),
      supabase
        .from("publisher_ratings")
        .select("rating")
        .eq("publisher_id", publisherId),
    ]);

    const items = itemsRes.data ?? [];
    const ratings = ratingsRes.data ?? [];

    const totalInstalls = items.reduce((sum, i) => sum + (i.install_count ?? 0), 0);
    const totalReviews = ratings.length;
    const averageRating =
      totalReviews > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : null;

    const itemsByStatus: Record<string, number> = {};
    for (const item of items) {
      const status = item.status ?? "unknown";
      itemsByStatus[status] = (itemsByStatus[status] ?? 0) + 1;
    }

    return {
      success: true,
      message: "Publisher analytics retrieved.",
      data: { totalInstalls, averageRating, totalReviews, itemsByStatus },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get publisher analytics.";
    return { success: false, message, error: message };
  }
}

// ─── ratePublisher ───────────────────────────────────────────────

export async function ratePublisher(
  publisherId: string,
  rating: number,
  review?: string
): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (rating < 1 || rating > 5) {
      return {
        success: false,
        message: "Rating must be between 1 and 5.",
      };
    }

    // Upsert: update if the user already rated this publisher
    const { data: existing } = await supabase
      .from("publisher_ratings")
      .select("id")
      .eq("publisher_id", publisherId)
      .eq("user_id", profile.id)
      .maybeSingle();

    let result;

    if (existing) {
      const { data, error } = await supabase
        .from("publisher_ratings")
        .update({ rating, review: review ?? null, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        logger.error("Failed to update publisher rating", {
          ratingId: existing.id,
          reason: error.message,
        });
        return {
          success: false,
          message: "Failed to update rating.",
          error: error.message,
        };
      }
      result = data;
    } else {
      const { data, error } = await supabase
        .from("publisher_ratings")
        .insert({
          publisher_id: publisherId,
          user_id: profile.id,
          rating,
          review: review ?? null,
        })
        .select()
        .single();

      if (error) {
        logger.error("Failed to create publisher rating", {
          publisherId,
          userId: profile.id,
          reason: error.message,
        });
        return {
          success: false,
          message: "Failed to rate publisher.",
          error: error.message,
        };
      }
      result = data;
    }

    logger.info("Publisher rated", {
      publisherId,
      rating,
      userId: profile.id,
    });

    return {
      success: true,
      message: "Publisher rated.",
      data: result as Record<string, unknown>,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to rate publisher.";
    return { success: false, message, error: message };
  }
}
