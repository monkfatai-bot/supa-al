"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServiceClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import {
  verifyWorkspaceMembership,
} from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { ServiceResult } from "./types";

// ─── Local types (tables not yet in generated types) ──────────

interface PlatformVersion {
  id: string;
  component: string;
  version: string;
  updated_at: string;
}

interface DependencyRow {
  id: string;
  item_id: string;
  dependency_type: string;
  dependency_ref: string;
  min_version: string | null;
  max_version: string | null;
}

interface CompatibilityIssue {
  dependency: DependencyRow;
  reason: string;
}

interface CompatibilityReport {
  compatible: boolean;
  issues: CompatibilityIssue[];
}

interface DependencyValidationIssue {
  dependency: DependencyRow;
  reason: string;
}

interface DependencyValidationReport {
  valid: boolean;
  issues: DependencyValidationIssue[];
}

// ─── Semver helpers ───────────────────────────────────────────

function parseSemver(version: string): number[] {
  const cleaned = version.replace(/^v/, "");
  const parts = cleaned.split(".");
  return parts
    .map((p) => parseInt(p, 10))
    .filter((n) => !Number.isNaN(n));
}

function satisfiesConstraint(
  version: string,
  minVersion?: string | null,
  maxVersion?: string | null
): boolean {
  const v = parseSemver(version);
  if (v.length === 0) return false;

  if (minVersion) {
    const min = parseSemver(minVersion);
    if (min.length > 0 && compareSemver(v, min) < 0) return false;
  }

  if (maxVersion) {
    const max = parseSemver(maxVersion);
    if (max.length > 0 && compareSemver(v, max) > 0) return false;
  }

  return true;
}

function compareSemver(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

// ─── getPlatformVersion ────────────────────────────────────────

export async function getPlatformVersion(): Promise<
  ServiceResult<PlatformVersion[]>
> {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("platform_versions")
      .select("*")
      .order("component");

    if (error) {
      logger.error("Failed to get platform versions", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get platform versions.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Platform has ${(data ?? []).length} versioned components.`,
      data: (data ?? []) as PlatformVersion[],
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get platform versions.";
    return { success: false, message, error: message };
  }
}

// ─── updatePlatformVersion ─────────────────────────────────────

export async function updatePlatformVersion(
  component: string,
  version: string
): Promise<ServiceResult<PlatformVersion>> {
  try {
    const profile = await requireAuth();
    const serviceClient = createServiceClient();

    if (profile.app_role !== "super_admin" && profile.app_role !== "admin") {
      return {
        success: false,
        message: "Insufficient permissions. Admin required.",
      };
    }

    // Upsert: update if exists, insert if not
    const { data: existing } = await serviceClient
      .from("platform_versions")
      .select("id")
      .eq("component", component)
      .single();

    let result;

    if (existing) {
      const { data, error } = await serviceClient
        .from("platform_versions")
        .update({ version, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        logger.error("Failed to update platform version", {
          component,
          reason: error.message,
        });
        return {
          success: false,
          message: "Failed to update platform version.",
          error: error.message,
        };
      }
      result = data;
    } else {
      const { data, error } = await serviceClient
        .from("platform_versions")
        .insert({ component, version })
        .select()
        .single();

      if (error) {
        logger.error("Failed to insert platform version", {
          component,
          reason: error.message,
        });
        return {
          success: false,
          message: "Failed to update platform version.",
          error: error.message,
        };
      }
      result = data;
    }

    logger.info("Platform version updated", {
      component,
      version,
      userId: profile.id,
    });

    return {
      success: true,
      message: `Platform component '${component}' set to v${version}.`,
      data: result as PlatformVersion,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to update platform version.";
    return { success: false, message, error: message };
  }
}

// ─── checkCompatibility ────────────────────────────────────────

export async function checkCompatibility(
  itemId: string
): Promise<ServiceResult<CompatibilityReport>> {
  try {
    const supabase = createServiceClient();

    // Fetch dependencies for the item
    const { data: deps, error: depsError } = await supabase
      .from("extension_dependencies")
      .select("*")
      .eq("item_id", itemId);

    if (depsError) {
      logger.error("Failed to fetch dependencies", {
        itemId,
        reason: depsError.message,
      });
      return {
        success: false,
        message: "Failed to check compatibility.",
        error: depsError.message,
      };
    }

    const dependencies = (deps ?? []) as DependencyRow[];

    // Fetch current platform versions
    const { data: versions } = await supabase
      .from("platform_versions")
      .select("*");

    const versionMap = new Map(
      ((versions ?? []) as PlatformVersion[]).map((v) => [
        v.component,
        v.version,
      ])
    );

    const issues: CompatibilityIssue[] = [];

    for (const dep of dependencies) {
      if (dep.dependency_type !== "platform") continue;

      const installedVersion = versionMap.get(dep.dependency_ref);
      if (!installedVersion) {
        issues.push({
          dependency: dep,
          reason: `Platform component '${dep.dependency_ref}' is not registered.`,
        });
        continue;
      }

      if (
        !satisfiesConstraint(
          installedVersion,
          dep.min_version,
          dep.max_version
        )
      ) {
        const range =
          dep.min_version && dep.max_version
            ? `${dep.min_version} – ${dep.max_version}`
            : dep.min_version
              ? `>= ${dep.min_version}`
              : dep.max_version
                ? `<= ${dep.max_version}`
                : "any";

        issues.push({
          dependency: dep,
          reason: `Installed v${installedVersion} does not satisfy required range ${range}.`,
        });
      }
    }

    return {
      success: true,
      message: issues.length === 0
        ? "Item is fully compatible."
        : `Found ${issues.length} compatibility issue(s).`,
      data: {
        compatible: issues.length === 0,
        issues,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to check compatibility.";
    return { success: false, message, error: message };
  }
}

// ─── validateDependencies ──────────────────────────────────────

export async function validateDependencies(
  itemId: string,
  workspaceId: string
): Promise<ServiceResult<DependencyValidationReport>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    // Get item dependencies
    const { data: deps, error: depsError } = await supabase
      .from("extension_dependencies")
      .select("*")
      .eq("item_id", itemId);

    if (depsError) {
      logger.error("Failed to fetch dependencies", {
        itemId,
        reason: depsError.message,
      });
      return {
        success: false,
        message: "Failed to validate dependencies.",
        error: depsError.message,
      };
    }

    const dependencies = (deps ?? []) as DependencyRow[];
    const issues: DependencyValidationIssue[] = [];

    // Collect integration-type dependency refs
    const integrationRefs = dependencies
      .filter((d) => d.dependency_type === "integration")
      .map((d) => d.dependency_ref);

    // Collect extension-type dependency refs
    const extensionRefs = dependencies
      .filter((d) => d.dependency_type === "extension")
      .map((d) => d.dependency_ref);

    // Check installed integrations in workspace
    if (integrationRefs.length > 0) {
      const { data: accounts } = await supabase
        .from("integration_accounts")
        .select("integration_id")
        .eq("workspace_id", workspaceId);

      const installedIntegrations = new Set(
        (accounts ?? []).map((a) => a.integration_id)
      );

      for (const dep of dependencies) {
        if (dep.dependency_type !== "integration") continue;
        if (!installedIntegrations.has(dep.dependency_ref)) {
          issues.push({
            dependency: dep,
            reason: `Required integration '${dep.dependency_ref}' is not installed in this workspace.`,
          });
        }
      }
    }

    // Check installed extensions in workspace
    if (extensionRefs.length > 0) {
      const { data: extensions } = await supabase
        .from("installed_extensions")
        .select("item_id")
        .eq("workspace_id", workspaceId);

      const installedExtensions = new Set(
        (extensions ?? []).map((e) => e.item_id)
      );

      for (const dep of dependencies) {
        if (dep.dependency_type !== "extension") continue;
        if (!installedExtensions.has(dep.dependency_ref)) {
          issues.push({
            dependency: dep,
            reason: `Required extension '${dep.dependency_ref}' is not installed in this workspace.`,
          });
        }
      }
    }

    return {
      success: true,
      message:
        issues.length === 0
          ? "All dependencies satisfied."
          : `Found ${issues.length} unmet dependency(ies).`,
      data: {
        valid: issues.length === 0,
        issues,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to validate dependencies.";
    return { success: false, message, error: message };
  }
}

// ─── addDependency ─────────────────────────────────────────────

export async function addDependency(data: {
  itemId: string;
  dependencyType: string;
  dependencyRef: string;
  minVersion?: string;
  maxVersion?: string;
}): Promise<ServiceResult<DependencyRow>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (profile.app_role !== "super_admin" && profile.app_role !== "admin") {
      return {
        success: false,
        message: "Insufficient permissions. Admin required.",
      };
    }

    const { data: dep, error } = await supabase
      .from("extension_dependencies")
      .insert({
        item_id: data.itemId,
        dependency_type: data.dependencyType,
        dependency_ref: data.dependencyRef,
        min_version: data.minVersion ?? null,
        max_version: data.maxVersion ?? null,
      })
      .select()
      .single();

    if (error || !dep) {
      logger.error("Failed to add dependency", {
        itemId: data.itemId,
        dependencyType: data.dependencyType,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to add dependency.",
        error: error?.message,
      };
    }

    logger.info("Dependency added", {
      itemId: data.itemId,
      dependencyType: data.dependencyType,
      dependencyRef: data.dependencyRef,
    });

    return {
      success: true,
      message: "Dependency added.",
      data: dep as DependencyRow,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add dependency.";
    return { success: false, message, error: message };
  }
}

// ─── removeDependency ──────────────────────────────────────────

export async function removeDependency(
  itemId: string,
  dependencyType: string,
  dependencyRef: string
): Promise<ServiceResult<{ removed: boolean }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (profile.app_role !== "super_admin" && profile.app_role !== "admin") {
      return {
        success: false,
        message: "Insufficient permissions. Admin required.",
      };
    }

    const { error } = await supabase
      .from("extension_dependencies")
      .delete()
      .eq("item_id", itemId)
      .eq("dependency_type", dependencyType)
      .eq("dependency_ref", dependencyRef);

    if (error) {
      logger.error("Failed to remove dependency", {
        itemId,
        dependencyType,
        dependencyRef,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to remove dependency.",
        error: error.message,
      };
    }

    logger.info("Dependency removed", {
      itemId,
      dependencyType,
      dependencyRef,
    });

    return {
      success: true,
      message: "Dependency removed.",
      data: { removed: true },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to remove dependency.";
    return { success: false, message, error: message };
  }
}

// ─── getItemDependencies ───────────────────────────────────────

export async function getItemDependencies(
  itemId: string
): Promise<ServiceResult<DependencyRow[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("extension_dependencies")
      .select("*")
      .eq("item_id", itemId)
      .order("dependency_type")
      .order("dependency_ref");

    if (error) {
      logger.error("Failed to get item dependencies", {
        userId: profile.id,
        itemId,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get item dependencies.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} dependencies.`,
      data: (data ?? []) as DependencyRow[],
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get item dependencies.";
    return { success: false, message, error: message };
  }
}

// ─── getCompatibleItems ────────────────────────────────────────

export async function getCompatibleItems(
  workspaceId: string,
  category?: string
): Promise<ServiceResult<{ id: string; name: string; slug: string; compatible: boolean; issues: CompatibilityIssue[] }[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    // Fetch published marketplace items
    let query = supabase
      .from("marketplace_items")
      .select("id, name, slug, category_id")
      .eq("status", "published");

    if (category) {
      // Resolve category id from slug if needed
      const { data: cat } = await supabase
        .from("marketplace_categories")
        .select("id")
        .eq("slug", category)
        .single();

      if (cat) {
        query = query.eq("category_id", cat.id);
      }
    }

    const { data: items, error: itemsError } = await query;

    if (itemsError) {
      logger.error("Failed to fetch marketplace items", {
        workspaceId,
        reason: itemsError.message,
      });
      return {
        success: false,
        message: "Failed to get compatible items.",
        error: itemsError.message,
      };
    }

    const itemList = items ?? [];
    if (itemList.length === 0) {
      return {
        success: true,
        message: "No marketplace items found.",
        data: [],
      };
    }

    // Batch fetch all dependencies for these items
    const itemIds = itemList.map((i) => i.id);
    const { data: allDeps } = await supabase
      .from("extension_dependencies")
      .select("*")
      .in("item_id", itemIds);

    const depsByItem = new Map<string, DependencyRow[]>();
    for (const dep of allDeps ?? []) {
      const list = depsByItem.get(dep.item_id) ?? [];
      list.push(dep as DependencyRow);
      depsByItem.set(dep.item_id, list);
    }

    // Fetch platform versions
    const serviceClient = createServiceClient();
    const { data: versions } = await serviceClient
      .from("platform_versions")
      .select("*");

    const versionMap = new Map(
      ((versions ?? []) as PlatformVersion[]).map((v) => [
        v.component,
        v.version,
      ])
    );

    // Fetch workspace installed integrations and extensions
    const [accRes, extRes] = await Promise.all([
      supabase
        .from("integration_accounts")
        .select("integration_id")
        .eq("workspace_id", workspaceId),
      supabase
        .from("installed_extensions")
        .select("item_id")
        .eq("workspace_id", workspaceId),
    ]);

    const installedIntegrations = new Set(
      (accRes.data ?? []).map((a) => a.integration_id)
    );
    const installedExtensions = new Set(
      (extRes.data ?? []).map((e) => e.item_id)
    );

    // Evaluate compatibility per item
    const results: {
      id: string;
      name: string;
      slug: string;
      compatible: boolean;
      issues: CompatibilityIssue[];
    }[] = [];

    for (const item of itemList) {
      const deps = depsByItem.get(item.id) ?? [];
      const issues: CompatibilityIssue[] = [];

      for (const dep of deps) {
        if (dep.dependency_type === "platform") {
          const installed = versionMap.get(dep.dependency_ref);
          if (!installed) {
            issues.push({
              dependency: dep,
              reason: `Platform component '${dep.dependency_ref}' not registered.`,
            });
          } else if (
            !satisfiesConstraint(
              installed,
              dep.min_version,
              dep.max_version
            )
          ) {
            issues.push({
              dependency: dep,
              reason: `Platform '${dep.dependency_ref}' v${installed} out of range.`,
            });
          }
        } else if (dep.dependency_type === "integration") {
          if (!installedIntegrations.has(dep.dependency_ref)) {
            issues.push({
              dependency: dep,
              reason: `Integration '${dep.dependency_ref}' not installed.`,
            });
          }
        } else if (dep.dependency_type === "extension") {
          if (!installedExtensions.has(dep.dependency_ref)) {
            issues.push({
              dependency: dep,
              reason: `Extension '${dep.dependency_ref}' not installed.`,
            });
          }
        }
      }

      results.push({
        id: item.id,
        name: item.name,
        slug: item.slug,
        compatible: issues.length === 0,
        issues,
      });
    }

    return {
      success: true,
      message: `Evaluated ${results.length} items.`,
      data: results,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get compatible items.";
    return { success: false, message, error: message };
  }
}
