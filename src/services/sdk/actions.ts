"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import type { SdkPackage } from "@/types/generated/database";
import type {
  SdkActionResponse,
  CreateSdkPackageRequest,
  UpdateSdkPackageRequest,
  SdkDocumentation,
} from "./types";
import { validateManifest } from "./types";

// ─── Helpers ──────────────────────────────────────────────────

function makeResponse(
  success: boolean,
  message: string,
  data?: unknown,
  error?: string
): SdkActionResponse {
  return { success, message, data, error };
}

// ═══════════════════════════════════════════════════════════════
// 1. LIST SDK PACKAGES
// ═══════════════════════════════════════════════════════════════

export async function listSdkPackages(
  status?: string
): Promise<SdkActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("sdk_packages")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to list SDK packages", { userId: profile.id, reason: error.message });
    return makeResponse(false, "Failed to fetch SDK packages.", undefined, "FETCH_FAILED");
  }

  return makeResponse(true, "SDK packages fetched.", data as unknown as SdkPackage[]);
}

// ═══════════════════════════════════════════════════════════════
// 2. GET SDK PACKAGE
// ═══════════════════════════════════════════════════════════════

export async function getSdkPackage(
  slug: string
): Promise<SdkActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("sdk_packages")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    logger.error("Failed to get SDK package", { slug, reason: error?.message });
    return makeResponse(false, "Package not found.", undefined, "NOT_FOUND");
  }

  return makeResponse(true, "Package fetched.", data as unknown as SdkPackage);
}

// ═══════════════════════════════════════════════════════════════
// 3. CREATE SDK PACKAGE (admin only)
// ═══════════════════════════════════════════════════════════════

export async function createSdkPackage(
  data: CreateSdkPackageRequest
): Promise<SdkActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Admin-only check
  if (profile.app_role !== "admin") {
    return makeResponse(false, "Admin access required.", undefined, "FORBIDDEN");
  }

  // Validate manifest
  const validation = validateManifest(data.manifest);
  if (!validation.valid) {
    return makeResponse(false, "Invalid manifest.", { errors: validation.errors }, "INVALID_MANIFEST");
  }

  // Generate slug
  const slug = data.name
    .toLowerCase()
    .trim()
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-");

  const { data: pkg, error } = await supabase
    .from("sdk_packages")
    .insert({
      name: data.name,
      slug,
      description: data.description ?? null,
      version: data.version,
      author: data.author ?? null,
      manifest: data.manifest as unknown as import("@/types/generated/database").Json,
      downloads: 0,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to create SDK package", { reason: error.message });
    return makeResponse(false, "Failed to create package.", undefined, "INSERT_FAILED");
  }

  return makeResponse(true, "Package created.", pkg);
}

// ═══════════════════════════════════════════════════════════════
// 4. UPDATE SDK PACKAGE
// ═══════════════════════════════════════════════════════════════

export async function updateSdkPackage(
  data: UpdateSdkPackageRequest
): Promise<SdkActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (profile.app_role !== "admin") {
    return makeResponse(false, "Admin access required.", undefined, "FORBIDDEN");
  }

  const updates: Record<string, unknown> = { ...data.updates };
  if (updates.manifest) {
    const validation = validateManifest(updates.manifest as Record<string, unknown>);
    if (!validation.valid) {
      return makeResponse(false, "Invalid manifest.", { errors: validation.errors }, "INVALID_MANIFEST");
    }
  }

  const { error } = await supabase
    .from("sdk_packages")
    .update(updates)
    .eq("slug", data.slug);

  if (error) {
    logger.error("Failed to update SDK package", { slug: data.slug, reason: error.message });
    return makeResponse(false, "Failed to update package.", undefined, "UPDATE_FAILED");
  }

  return makeResponse(true, "Package updated.");
}

// ═══════════════════════════════════════════════════════════════
// 5. DELETE SDK PACKAGE (admin — soft archive)
// ═══════════════════════════════════════════════════════════════

export async function deleteSdkPackage(
  slug: string
): Promise<SdkActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (profile.app_role !== "admin") {
    return makeResponse(false, "Admin access required.", undefined, "FORBIDDEN");
  }

  const { error } = await supabase
    .from("sdk_packages")
    .update({ status: "archived" })
    .eq("slug", slug);

  if (error) {
    logger.error("Failed to archive SDK package", { slug, reason: error.message });
    return makeResponse(false, "Failed to delete package.", undefined, "DELETE_FAILED");
  }

  return makeResponse(true, "Package archived.");
}

// ═══════════════════════════════════════════════════════════════
// 6. DOWNLOAD SDK PACKAGE
// ═══════════════════════════════════════════════════════════════

export async function downloadSdkPackage(
  slug: string
): Promise<SdkActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: pkg, error } = await supabase
    .from("sdk_packages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (error || !pkg) {
    logger.error("Failed to get SDK package for download", { slug, reason: error?.message });
    return makeResponse(false, "Package not found.", undefined, "NOT_FOUND");
  }

  // Increment download count
  await supabase
    .from("sdk_packages")
    .update({ downloads: (pkg.downloads ?? 0) + 1 })
    .eq("id", pkg.id);

  return makeResponse(true, "Download recorded.", pkg as unknown as SdkPackage);
}

// ═══════════════════════════════════════════════════════════════
// 7. VALIDATE MANIFEST (imported from types.ts for client-side use)
// ═══════════════════════════════════════════════════════════════

// validateManifest is available from ./types for client-side imports

// ═══════════════════════════════════════════════════════════════
// 8. GET SDK DOCUMENTATION
// ═══════════════════════════════════════════════════════════════

export async function getSdkDocumentation(): Promise<SdkActionResponse> {
  await requireAuth();

  const docs: SdkDocumentation = {
    title: "Extension SDK Documentation",
    version: "1.0.0",
    sections: [
      {
        heading: "Getting Started",
        content:
          "The Extension SDK allows you to build custom extensions for the marketplace. Start by creating a manifest.json file in your project root.",
      },
      {
        heading: "Manifest Format",
        content:
          "Your manifest.json must include: name (string), version (semver string), type (extension type), permissions (array of permission strings), and entryPoint (relative path to your main module).",
      },
      {
        heading: "Extension Types",
        content:
          "Supported types: ai_employee, workflow_template, business_template, prompt_pack, node_pack, integration_pack, extension.",
      },
      {
        heading: "Publishing",
        content:
          "Use the createSdkPackage server action to register your package. After review, it will appear in the SDK packages list.",
      },
    ],
  };

  return makeResponse(true, "Documentation fetched.", docs);
}
