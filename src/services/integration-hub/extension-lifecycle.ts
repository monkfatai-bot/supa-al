"use server";

/**
 * Category 20 — Extension Lifecycle
 *
 * Manages the full lifecycle of installed extensions: install,
 * update, rollback, pin/unpin versions, enable/disable, uninstall,
 * version history, and update checking.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { requireMinimumRole } from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import { checkCompatibility } from "./compatibility-manager";
import type { ServiceResult } from "./types";

// ─── Local types ────────────────────────────────────────────────

interface InstalledExtension {
  id: string;
  workspace_id: string;
  item_id: string;
  current_version: string;
  pinned_version: string | null;
  previous_version: string | null;
  status: string;
  config: Record<string, unknown> | null;
  installed_at: string;
  updated_at: string;
  uninstalled_at: string | null;
  rollback_count: number;
}

interface ExtensionVersion {
  id: string;
  item_id: string;
  version: string;
  changelog: string | null;
  created_at: string;
}

interface UpdatableExtension {
  installedExtensionId: string;
  itemId: string;
  itemName: string;
  currentVersion: string;
  latestVersion: string;
  pinned: boolean;
}

// ─── installExtension ────────────────────────────────────────────

export async function installExtension(params: {
  workspaceId: string;
  itemId: string;
  config?: Record<string, unknown>;
}): Promise<ServiceResult<InstalledExtension>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "member");

    // Check compatibility before installing
    const compatResult = await checkCompatibility(params.itemId);
    if (!compatResult.success) {
      return {
        success: false,
        message: `Compatibility check failed: ${compatResult.message}`,
      };
    }
    if (compatResult.data && !compatResult.data.compatible) {
      return {
        success: false,
        message: "Extension is not compatible with the current platform version.",
        error: "INCOMPATIBLE",
      };
    }

    // Get the latest version from extension_versions
    const { data: latestVersion } = await supabase
      .from("extension_versions")
      .select("version")
      .eq("item_id", params.itemId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const version = latestVersion?.version ?? "1.0.0";

    // Check if already installed
    const { data: existing } = await supabase
      .from("installed_extensions")
      .select("id, status")
      .eq("workspace_id", params.workspaceId)
      .eq("item_id", params.itemId)
      .maybeSingle();

    if (existing && existing.status === "active") {
      return {
        success: false,
        message: "Extension is already installed in this workspace.",
      };
    }

    const now = new Date().toISOString();

    // If previously uninstalled, reactivate instead
    if (existing) {
      const { data, error } = await supabase
        .from("installed_extensions")
        .update({
          status: "active",
          current_version: version,
          config: params.config ?? null,
          uninstalled_at: null,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        logger.error("Failed to reactivate extension", {
          installedExtensionId: existing.id,
          reason: error.message,
        });
        return {
          success: false,
          message: "Failed to reactivate extension.",
          error: error.message,
        };
      }
      return { success: true, message: "Extension reactivated.", data: data as InstalledExtension };
    }

    // Fresh install
    const { data, error } = await supabase
      .from("installed_extensions")
      .insert({
        workspace_id: params.workspaceId,
        item_id: params.itemId,
        current_version: version,
        status: "active",
        config: params.config ?? null,
        installed_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to install extension", {
        itemId: params.itemId,
        workspaceId: params.workspaceId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to install extension.",
        error: error?.message,
      };
    }

    // Increment install_count on marketplace_item
    await supabase.rpc("increment_install_count", { item_id: params.itemId });

    logger.info("Extension installed", {
      installedExtensionId: data.id,
      itemId: params.itemId,
      workspaceId: params.workspaceId,
      version,
      userId: profile.id,
    });

    return {
      success: true,
      message: "Extension installed.",
      data: data as InstalledExtension,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to install extension.";
    return { success: false, message, error: message };
  }
}

// ─── updateExtension ─────────────────────────────────────────────

export async function updateExtension(params: {
  workspaceId: string;
  installedExtensionId: string;
  version?: string;
}): Promise<ServiceResult<InstalledExtension>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "member");

    const { data: installed, error: fetchError } = await supabase
      .from("installed_extensions")
      .select("id, item_id, current_version, pinned_version, status")
      .eq("id", params.installedExtensionId)
      .eq("workspace_id", params.workspaceId)
      .single();

    if (fetchError || !installed) {
      return { success: false, message: "Installed extension not found.", error: fetchError?.message };
    }

    // Determine target version
    let targetVersion = params.version;
    if (!targetVersion) {
      const { data: latest } = await supabase
        .from("extension_versions")
        .select("version")
        .eq("item_id", installed.item_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      targetVersion = latest?.version;
    }

    if (!targetVersion || targetVersion === installed.current_version) {
      return { success: false, message: "No new version available." };
    }

    // If pinned, prevent update
    if (installed.pinned_version) {
      return {
        success: false,
        message: "Extension version is pinned. Unpin before updating.",
        error: "VERSION_PINNED",
      };
    }

    // Compatibility check
    const compatResult = await checkCompatibility(installed.item_id);
    if (compatResult.data && !compatResult.data.compatible) {
      return {
        success: false,
        message: "New version is not compatible with the current platform.",
        error: "INCOMPATIBLE",
      };
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("installed_extensions")
      .update({
        previous_version: installed.current_version,
        current_version: targetVersion,
        status: "active",
        updated_at: now,
      })
      .eq("id", params.installedExtensionId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to update extension", {
        installedExtensionId: params.installedExtensionId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to update extension.",
        error: error?.message,
      };
    }

    logger.info("Extension updated", {
      installedExtensionId: params.installedExtensionId,
      fromVersion: installed.current_version,
      toVersion: targetVersion,
      userId: profile.id,
    });

    return {
      success: true,
      message: `Extension updated to v${targetVersion}.`,
      data: data as InstalledExtension,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update extension.";
    return { success: false, message, error: message };
  }
}

// ─── rollbackExtension ───────────────────────────────────────────

export async function rollbackExtension(
  installedExtensionId: string
): Promise<ServiceResult<InstalledExtension>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: installed, error: fetchError } = await supabase
      .from("installed_extensions")
      .select("id, workspace_id, item_id, current_version, previous_version, rollback_count")
      .eq("id", installedExtensionId)
      .single();

    if (fetchError || !installed) {
      return { success: false, message: "Installed extension not found.", error: fetchError?.message };
    }

    if (!installed.previous_version) {
      return { success: false, message: "No previous version to roll back to." };
    }

    await requireMinimumRole(installed.workspace_id, profile.id, "member");

    const prevVersion = installed.previous_version;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("installed_extensions")
      .update({
        previous_version: installed.current_version,
        current_version: prevVersion,
        rollback_count: (installed.rollback_count ?? 0) + 1,
        status: "active",
        updated_at: now,
      })
      .eq("id", installedExtensionId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to rollback extension", {
        installedExtensionId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to rollback extension.",
        error: error?.message,
      };
    }

    // Log rollback to integration_logs
    await supabase.from("integration_logs").insert({
      workspace_id: installed.workspace_id,
      integration_id: installed.item_id,
      action: "extension_rollback",
      direction: "internal" as const,
      status: "success" as const,
      details: {
        installedExtensionId,
        fromVersion: installed.current_version,
        toVersion: prevVersion,
        performedBy: profile.id,
      },
    });

    logger.info("Extension rolled back", {
      installedExtensionId,
      fromVersion: installed.current_version,
      toVersion: prevVersion,
      userId: profile.id,
    });

    return {
      success: true,
      message: `Rolled back to v${prevVersion}.`,
      data: data as InstalledExtension,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rollback extension.";
    return { success: false, message, error: message };
  }
}

// ─── enableExtension ─────────────────────────────────────────────

export async function enableExtension(
  installedExtensionId: string
): Promise<ServiceResult<InstalledExtension>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: ext, error: fetchError } = await supabase
      .from("installed_extensions")
      .select("id, workspace_id")
      .eq("id", installedExtensionId)
      .single();

    if (fetchError || !ext) {
      return { success: false, message: "Installed extension not found.", error: fetchError?.message };
    }

    await requireMinimumRole(ext.workspace_id, profile.id, "member");

    const { data, error } = await supabase
      .from("installed_extensions")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", installedExtensionId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to enable extension", {
        installedExtensionId,
        reason: error?.message,
      });
      return { success: false, message: "Failed to enable extension.", error: error?.message };
    }

    logger.info("Extension enabled", { installedExtensionId, userId: profile.id });
    return { success: true, message: "Extension enabled.", data: data as InstalledExtension };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enable extension.";
    return { success: false, message, error: message };
  }
}

// ─── disableExtension ────────────────────────────────────────────

export async function disableExtension(
  installedExtensionId: string
): Promise<ServiceResult<InstalledExtension>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: ext, error: fetchError } = await supabase
      .from("installed_extensions")
      .select("id, workspace_id")
      .eq("id", installedExtensionId)
      .single();

    if (fetchError || !ext) {
      return { success: false, message: "Installed extension not found.", error: fetchError?.message };
    }

    await requireMinimumRole(ext.workspace_id, profile.id, "member");

    const { data, error } = await supabase
      .from("installed_extensions")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", installedExtensionId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to disable extension", {
        installedExtensionId,
        reason: error?.message,
      });
      return { success: false, message: "Failed to disable extension.", error: error?.message };
    }

    logger.info("Extension disabled", { installedExtensionId, userId: profile.id });
    return { success: true, message: "Extension disabled.", data: data as InstalledExtension };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to disable extension.";
    return { success: false, message, error: message };
  }
}

// ─── uninstallExtension ──────────────────────────────────────────

export async function uninstallExtension(
  installedExtensionId: string
): Promise<ServiceResult<InstalledExtension>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: ext, error: fetchError } = await supabase
      .from("installed_extensions")
      .select("id, workspace_id")
      .eq("id", installedExtensionId)
      .single();

    if (fetchError || !ext) {
      return { success: false, message: "Installed extension not found.", error: fetchError?.message };
    }

    await requireMinimumRole(ext.workspace_id, profile.id, "member");

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("installed_extensions")
      .update({ status: "inactive", uninstalled_at: now, updated_at: now })
      .eq("id", installedExtensionId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to uninstall extension", {
        installedExtensionId,
        reason: error?.message,
      });
      return { success: false, message: "Failed to uninstall extension.", error: error?.message };
    }

    logger.info("Extension uninstalled", { installedExtensionId, userId: profile.id });
    return { success: true, message: "Extension uninstalled.", data: data as InstalledExtension };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to uninstall extension.";
    return { success: false, message, error: message };
  }
}

// ─── pinVersion ──────────────────────────────────────────────────

export async function pinVersion(
  installedExtensionId: string,
  version: string
): Promise<ServiceResult<InstalledExtension>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: ext, error: fetchError } = await supabase
      .from("installed_extensions")
      .select("id, workspace_id, current_version")
      .eq("id", installedExtensionId)
      .single();

    if (fetchError || !ext) {
      return { success: false, message: "Installed extension not found.", error: fetchError?.message };
    }

    await requireMinimumRole(ext.workspace_id, profile.id, "member");

    const { data, error } = await supabase
      .from("installed_extensions")
      .update({
        pinned_version: version,
        current_version: version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", installedExtensionId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to pin extension version", {
        installedExtensionId,
        version,
        reason: error?.message,
      });
      return { success: false, message: "Failed to pin version.", error: error?.message };
    }

    logger.info("Extension version pinned", {
      installedExtensionId,
      version,
      userId: profile.id,
    });

    return { success: true, message: `Version pinned to v${version}.`, data: data as InstalledExtension };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pin version.";
    return { success: false, message, error: message };
  }
}

// ─── unpinVersion ────────────────────────────────────────────────

export async function unpinVersion(
  installedExtensionId: string
): Promise<ServiceResult<InstalledExtension>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: ext, error: fetchError } = await supabase
      .from("installed_extensions")
      .select("id, workspace_id")
      .eq("id", installedExtensionId)
      .single();

    if (fetchError || !ext) {
      return { success: false, message: "Installed extension not found.", error: fetchError?.message };
    }

    await requireMinimumRole(ext.workspace_id, profile.id, "member");

    const { data, error } = await supabase
      .from("installed_extensions")
      .update({ pinned_version: null, updated_at: new Date().toISOString() })
      .eq("id", installedExtensionId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to unpin extension version", {
        installedExtensionId,
        reason: error?.message,
      });
      return { success: false, message: "Failed to unpin version.", error: error?.message };
    }

    logger.info("Extension version unpinned", { installedExtensionId, userId: profile.id });
    return { success: true, message: "Version unpinned.", data: data as InstalledExtension };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to unpin version.";
    return { success: false, message, error: message };
  }
}

// ─── getExtensionVersionHistory ──────────────────────────────────

export async function getExtensionVersionHistory(
  itemId: string
): Promise<ServiceResult<ExtensionVersion[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("extension_versions")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to get version history", {
        itemId,
        userId: profile.id,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get version history.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} versions.`,
      data: (data ?? []) as ExtensionVersion[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get version history.";
    return { success: false, message, error: message };
  }
}

// ─── checkForUpdates ─────────────────────────────────────────────

export async function checkForUpdates(
  workspaceId: string
): Promise<ServiceResult<UpdatableExtension[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member");

    // Get all active installed extensions for the workspace
    const { data: installed, error: instError } = await supabase
      .from("installed_extensions")
      .select("id, item_id, current_version, pinned_version")
      .eq("workspace_id", workspaceId)
      .eq("status", "active");

    if (instError) {
      logger.error("Failed to fetch installed extensions", {
        workspaceId,
        reason: instError.message,
      });
      return {
        success: false,
        message: "Failed to check for updates.",
        error: instError.message,
      };
    }

    const extensions = installed ?? [];
    if (extensions.length === 0) {
      return { success: true, message: "No extensions installed.", data: [] };
    }

    // Get item names
    const itemIds = extensions.map((e) => e.item_id);
    const { data: items } = await supabase
      .from("marketplace_items")
      .select("id, name")
      .in("id", itemIds);

    const itemNameMap = new Map(
      (items ?? []).map((i) => [i.id, i.name])
    );

    // Get latest versions for all items
    const { data: latestVersions } = await supabase
      .from("extension_versions")
      .select("item_id, version")
      .in("item_id", itemIds);

    // Find the latest version per item
    const latestByItem = new Map<string, string>();
    for (const v of latestVersions ?? []) {
      const existing = latestByItem.get(v.item_id);
      if (!existing || v.version > existing) {
        latestByItem.set(v.item_id, v.version);
      }
    }

    // Compare installed vs latest
    const updatable: UpdatableExtension[] = [];

    for (const ext of extensions) {
      const latest = latestByItem.get(ext.item_id);
      if (!latest || latest === ext.current_version) continue;
      // Skip pinned extensions
      if (ext.pinned_version) continue;

      updatable.push({
        installedExtensionId: ext.id,
        itemId: ext.item_id,
        itemName: itemNameMap.get(ext.item_id) ?? ext.item_id,
        currentVersion: ext.current_version,
        latestVersion: latest,
        pinned: false,
      });
    }

    return {
      success: true,
      message: updatable.length > 0
        ? `Found ${updatable.length} extension(s) with updates.`
        : "All extensions are up to date.",
      data: updatable,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to check for updates.";
    return { success: false, message, error: message };
  }
}

// ─── getInstalledExtensions ──────────────────────────────────────

export async function getInstalledExtensions(
  workspaceId: string
): Promise<ServiceResult<InstalledExtension[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "member");

    const { data, error } = await supabase
      .from("installed_extensions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("installed_at", { ascending: false });

    if (error) {
      logger.error("Failed to get installed extensions", {
        workspaceId,
        userId: profile.id,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get installed extensions.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} installed extensions.`,
      data: (data ?? []) as InstalledExtension[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get installed extensions.";
    return { success: false, message, error: message };
  }
}
