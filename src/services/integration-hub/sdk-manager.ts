"use server";

/**
 * Category 22 — Developer SDK Manager
 *
 * Publishes, manages, and serves SDK packages for extension developers.
 * Handles manifest validation, deprecation, install commands, and download tracking.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import type { ServiceResult } from "./types";

// ─── SdkManifest interface ──────────────────────────────────────

export interface SdkManifest {
  name: string;
  version: string;
  type: "integration" | "workflow-node" | "ai-employee" | "business-module" | "marketplace-app";
  description: string;
  permissions: string[];
  entry: string;
  capabilities?: string[];
  dependencies?: Record<string, string>;
  author: string;
  repository?: string;
}

const VALID_SDK_TYPES = [
  "integration",
  "workflow-node",
  "ai-employee",
  "business-module",
  "marketplace-app",
] as const;

// ─── Local types ────────────────────────────────────────────────

interface SdkPackage {
  id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  manifest: SdkManifest;
  permission_declarations: string[];
  capability_requirements: string[];
  compatibility: string[];
  package_url: string;
  checksum: string;
  size_bytes: number | null;
  download_count: number;
  is_deprecated: boolean;
  author_id: string;
  created_at: string;
  updated_at: string;
}

interface PublishSdkPackageData {
  name: string;
  slug: string;
  description: string;
  version: string;
  manifest: SdkManifest;
  permissionDeclarations: string[];
  capabilityRequirements: string[];
  compatibility: string[];
  packageUrl: string;
  checksum: string;
  sizeBytes?: number;
}

interface ListSdkPackagesFilter {
  search?: string;
  capability?: string;
  limit?: number;
  offset?: number;
}

// ─── validateManifest ───────────────────────────────────────────

export async function validateManifest(
  manifest: Record<string, unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!manifest.name || typeof manifest.name !== "string") {
    errors.push("Manifest must have a 'name' string field.");
  }

  if (!manifest.version || typeof manifest.version !== "string") {
    errors.push("Manifest must have a 'version' string field.");
  }

  if (!manifest.type || typeof manifest.type !== "string") {
    errors.push("Manifest must have a 'type' string field.");
  } else if (!VALID_SDK_TYPES.includes(manifest.type as (typeof VALID_SDK_TYPES)[number])) {
    errors.push(
      `Manifest 'type' must be one of: ${VALID_SDK_TYPES.join(", ")}.`
    );
  }

  if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
    errors.push("Manifest must have a 'permissions' array field.");
  }

  if (!manifest.entry || typeof manifest.entry !== "string") {
    errors.push("Manifest must have an 'entry' string field.");
  }

  return { valid: errors.length === 0, errors };
}

// ─── publishSdkPackage ──────────────────────────────────────────

export async function publishSdkPackage(
  data: PublishSdkPackageData
): Promise<ServiceResult<SdkPackage>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Validate manifest
    const { valid, errors } = await validateManifest(data.manifest as unknown as Record<string, unknown>);
    if (!valid) {
      return {
        success: false,
        message: "Invalid manifest: " + errors.join(" "),
        error: "INVALID_MANIFEST",
      };
    }

    // Check slug uniqueness
    const { data: existing } = await supabase
      .from("sdk_packages")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        message: "SDK package slug is already taken.",
        error: "SLUG_NOT_UNIQUE",
      };
    }

    const now = new Date().toISOString();

    const { data: pkg, error } = await supabase
      .from("sdk_packages")
      .insert({
        name: data.name,
        slug: data.slug,
        description: data.description,
        version: data.version,
        manifest: data.manifest,
        permission_declarations: data.permissionDeclarations,
        capability_requirements: data.capabilityRequirements,
        compatibility: data.compatibility,
        package_url: data.packageUrl,
        checksum: data.checksum,
        size_bytes: data.sizeBytes ?? null,
        author_id: profile.id,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !pkg) {
      logger.error("Failed to publish SDK package", {
        slug: data.slug,
        userId: profile.id,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to publish SDK package.",
        error: error?.message,
      };
    }

    logger.info("SDK package published", {
      packageId: pkg.id,
      slug: data.slug,
      userId: profile.id,
    });

    return {
      success: true,
      message: "SDK package published.",
      data: pkg as SdkPackage,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to publish SDK package.";
    return { success: false, message, error: message };
  }
}

// ─── getSdkPackages ─────────────────────────────────────────────

export async function getSdkPackages(
  filter?: ListSdkPackagesFilter
): Promise<ServiceResult<{ packages: SdkPackage[]; total: number }>> {
  try {
    const supabase = await createServerSupabaseClient();

    const limit = filter?.limit ?? 20;
    const offset = filter?.offset ?? 0;

    let query = supabase
      .from("sdk_packages")
      .select("*", { count: "exact" })
      .order("download_count", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter?.search) {
      query = query.or(
        `name.ilike.%${filter.search}%,slug.ilike.%${filter.search}%,description.ilike.%${filter.search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error("Failed to list SDK packages", { reason: error.message });
      return {
        success: false,
        message: "Failed to list SDK packages.",
        error: error.message,
      };
    }

    let packages = (data ?? []) as SdkPackage[];

    // Post-filter by capability if specified
    if (filter?.capability) {
      packages = packages.filter(
        (p) =>
          p.capability_requirements?.includes(filter.capability!) ||
          (p.manifest as SdkManifest)?.capabilities?.includes(filter.capability!)
      );
    }

    return {
      success: true,
      message: `Found ${packages.length} SDK packages.`,
      data: { packages, total: count ?? 0 },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list SDK packages.";
    return { success: false, message, error: message };
  }
}

// ─── getSdkPackage ──────────────────────────────────────────────

export async function getSdkPackage(
  slugOrId: string
): Promise<ServiceResult<SdkPackage>> {
  try {
    const supabase = await createServerSupabaseClient();

    // Try by ID first, then by slug
    const { data: byId } = await supabase
      .from("sdk_packages")
      .select("*")
      .eq("id", slugOrId)
      .maybeSingle();

    if (byId) {
      return {
        success: true,
        message: "SDK package retrieved.",
        data: byId as SdkPackage,
      };
    }

    const { data: bySlug, error } = await supabase
      .from("sdk_packages")
      .select("*")
      .eq("slug", slugOrId)
      .single();

    if (error || !bySlug) {
      return {
        success: false,
        message: "SDK package not found.",
        error: error?.message,
      };
    }

    return {
      success: true,
      message: "SDK package retrieved.",
      data: bySlug as SdkPackage,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get SDK package.";
    return { success: false, message, error: message };
  }
}

// ─── updateSdkPackage ───────────────────────────────────────────

export async function updateSdkPackage(
  packageId: string,
  data: Partial<{
    description: string;
    manifest: SdkManifest;
    packageUrl: string;
    checksum: string;
    sizeBytes: number;
  }>
): Promise<ServiceResult<SdkPackage>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Author check
    const { data: existing, error: fetchError } = await supabase
      .from("sdk_packages")
      .select("id, author_id")
      .eq("id", packageId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        message: "SDK package not found.",
        error: fetchError?.message,
      };
    }

    if (existing.author_id !== profile.id) {
      return {
        success: false,
        message: "Only the package author can update it.",
      };
    }

    // Validate manifest if provided
    if (data.manifest) {
      const { valid, errors } = await validateManifest(
        data.manifest as unknown as Record<string, unknown>
      );
      if (!valid) {
        return {
          success: false,
          message: "Invalid manifest: " + errors.join(" "),
          error: "INVALID_MANIFEST",
        };
      }
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.description !== undefined) payload.description = data.description;
    if (data.manifest !== undefined) payload.manifest = data.manifest;
    if (data.packageUrl !== undefined) payload.package_url = data.packageUrl;
    if (data.checksum !== undefined) payload.checksum = data.checksum;
    if (data.sizeBytes !== undefined) payload.size_bytes = data.sizeBytes;

    const { data: pkg, error } = await supabase
      .from("sdk_packages")
      .update(payload)
      .eq("id", packageId)
      .select()
      .single();

    if (error || !pkg) {
      logger.error("Failed to update SDK package", {
        packageId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to update SDK package.",
        error: error?.message,
      };
    }

    logger.info("SDK package updated", { packageId, userId: profile.id });

    return {
      success: true,
      message: "SDK package updated.",
      data: pkg as SdkPackage,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update SDK package.";
    return { success: false, message, error: message };
  }
}

// ─── deprecateSdkPackage ────────────────────────────────────────

export async function deprecateSdkPackage(
  packageId: string
): Promise<ServiceResult<SdkPackage>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: fetchError } = await supabase
      .from("sdk_packages")
      .select("id, author_id, name")
      .eq("id", packageId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        message: "SDK package not found.",
        error: fetchError?.message,
      };
    }

    if (existing.author_id !== profile.id) {
      return {
        success: false,
        message: "Only the package author can deprecate it.",
      };
    }

    const { data, error } = await supabase
      .from("sdk_packages")
      .update({
        is_deprecated: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", packageId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to deprecate SDK package", {
        packageId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to deprecate SDK package.",
        error: error?.message,
      };
    }

    logger.info("SDK package deprecated", {
      packageId,
      name: existing.name,
      userId: profile.id,
    });

    return {
      success: true,
      message: "SDK package marked as deprecated.",
      data: data as SdkPackage,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to deprecate SDK package.";
    return { success: false, message, error: message };
  }
}

// ─── getSdkInstallCommand ───────────────────────────────────────

export async function getSdkInstallCommand(
  slug: string,
  version?: string
): Promise<ServiceResult<{ command: string }>> {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: pkg, error } = await supabase
      .from("sdk_packages")
      .select("slug, version, is_deprecated")
      .eq("slug", slug)
      .single();

    if (error || !pkg) {
      return {
        success: false,
        message: "SDK package not found.",
        error: error?.message,
      };
    }

    const resolvedVersion = version ?? pkg.version;
    const command = `npx @sdk-registry/${pkg.slug}@${resolvedVersion}`;

    return {
      success: true,
      message: pkg.is_deprecated
        ? "Warning: this SDK package is deprecated."
        : "Install command generated.",
      data: { command },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get install command.";
    return { success: false, message, error: message };
  }
}

// ─── incrementDownloads ─────────────────────────────────────────

export async function incrementDownloads(
  packageId: string
): Promise<ServiceResult<{ downloadCount: number }>> {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: fetchError } = await supabase
      .from("sdk_packages")
      .select("id, download_count")
      .eq("id", packageId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        message: "SDK package not found.",
        error: fetchError?.message,
      };
    }

    const newCount = (existing.download_count ?? 0) + 1;

    const { error } = await supabase
      .from("sdk_packages")
      .update({ download_count: newCount, updated_at: new Date().toISOString() })
      .eq("id", packageId);

    if (error) {
      logger.error("Failed to increment download count", {
        packageId,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to increment downloads.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: "Download count incremented.",
      data: { downloadCount: newCount },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to increment downloads.";
    return { success: false, message, error: message };
  }
}

// ─── getPopularSdkPackages ──────────────────────────────────────

export async function getPopularSdkPackages(
  limit: number = 10
): Promise<ServiceResult<SdkPackage[]>> {
  try {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("sdk_packages")
      .select("*")
      .eq("is_deprecated", false)
      .order("download_count", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Failed to get popular SDK packages", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get popular SDK packages.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Top ${(data ?? []).length} SDK packages by downloads.`,
      data: (data ?? []) as SdkPackage[],
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get popular SDK packages.";
    return { success: false, message, error: message };
  }
}
