"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import {
  verifyWorkspaceMembership,
} from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { ServiceResult } from "./types";

// ─── Local types (tables lack generated types) ─────────────────

interface Capability {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  icon: string | null;
  created_at: string;
}

interface CapabilityWithIntegration extends Capability {
  integration_id: string;
}

interface ListCapabilitiesFilter {
  category?: string;
  search?: string;
}

interface RegisterCapabilityData {
  name: string;
  slug: string;
  description: string;
  category: string;
  icon?: string;
}

// ─── listCapabilities ──────────────────────────────────────────

export async function listCapabilities(
  filter?: ListCapabilitiesFilter
): Promise<ServiceResult<Capability[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from("integration_capabilities")
      .select("*")
      .order("category")
      .order("name");

    if (filter?.category) {
      query = query.eq("category", filter.category);
    }

    if (filter?.search) {
      query = query.or(
        `name.ilike.%${filter.search}%,slug.ilike.%${filter.search}%,description.ilike.%${filter.search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to list capabilities", {
        userId: profile.id,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to list capabilities.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} capabilities.`,
      data: (data ?? []) as Capability[],
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list capabilities.";
    return { success: false, message, error: message };
  }
}

// ─── getIntegrationCapabilities ────────────────────────────────

export async function getIntegrationCapabilities(
  integrationId: string
): Promise<ServiceResult<Capability[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("integration_capabilities_map")
      .select("capability_id, integration_capabilities(*)")
      .eq("integration_id", integrationId);

    if (error) {
      logger.error("Failed to get integration capabilities", {
        userId: profile.id,
        integrationId,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get integration capabilities.",
        error: error.message,
      };
    }

    const capabilities = (data ?? []).map(
      (row) => (row.integration_capabilities as unknown as Capability)
    );

    return {
      success: true,
      message: `Found ${capabilities.length} capabilities.`,
      data: capabilities,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get integration capabilities.";
    return { success: false, message, error: message };
  }
}

// ─── findIntegrationsByCapability ──────────────────────────────

export async function findIntegrationsByCapability(
  capabilitySlug: string,
  workspaceId: string
): Promise<ServiceResult<CapabilityWithIntegration[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    // Resolve capability id from slug
    const { data: cap, error: capError } = await supabase
      .from("integration_capabilities")
      .select("id")
      .eq("slug", capabilitySlug)
      .single();

    if (capError || !cap) {
      return {
        success: false,
        message: "Capability not found.",
        error: capError?.message,
      };
    }

    // Find integrations installed in this workspace that have this capability
    const { data, error } = await supabase
      .from("integration_capabilities_map")
      .select(
        "integration_id, integration_capabilities(*)"
      )
      .eq("capability_id", cap.id);

    if (error) {
      logger.error("Failed to find integrations by capability", {
        userId: profile.id,
        workspaceId,
        capabilitySlug,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to find integrations by capability.",
        error: error.message,
      };
    }

    // Filter to only integrations installed in the workspace
    const installedIds = (data ?? []).map((r) => r.integration_id);
    let filtered = data as unknown as CapabilityWithIntegration[];

    if (installedIds.length > 0) {
      const { data: accounts } = await supabase
        .from("integration_accounts")
        .select("integration_id")
        .eq("workspace_id", workspaceId);

      const installedSet = new Set(
        (accounts ?? []).map((a) => a.integration_id)
      );
      filtered = (data ?? []).filter((r) =>
        installedSet.has(r.integration_id)
      ) as unknown as CapabilityWithIntegration[];
    } else {
      filtered = [];
    }

    return {
      success: true,
      message: `Found ${filtered.length} integrations with capability '${capabilitySlug}'.`,
      data: filtered,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to find integrations by capability.";
    return { success: false, message, error: message };
  }
}

// ─── registerCapability ───────────────────────────────────────

export async function registerCapability(
  data: RegisterCapabilityData
): Promise<ServiceResult<Capability>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Platform admin check
    if (profile.app_role !== "super_admin" && profile.app_role !== "admin") {
      return {
        success: false,
        message: "Insufficient permissions. Admin required.",
      };
    }

    const { data: cap, error } = await supabase
      .from("integration_capabilities")
      .insert({
        name: data.name,
        slug: data.slug,
        description: data.description,
        category: data.category,
        icon: data.icon ?? null,
      })
      .select()
      .single();

    if (error || !cap) {
      logger.error("Failed to register capability", {
        userId: profile.id,
        slug: data.slug,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to register capability.",
        error: error?.message,
      };
    }

    logger.info("Capability registered", { slug: data.slug, id: cap.id });

    return {
      success: true,
      message: "Capability registered.",
      data: cap as Capability,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to register capability.";
    return { success: false, message, error: message };
  }
}

// ─── updateIntegrationCapabilities ─────────────────────────────

export async function updateIntegrationCapabilities(
  integrationId: string,
  capabilityIds: string[]
): Promise<ServiceResult<{ replaced: boolean }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (profile.app_role !== "super_admin" && profile.app_role !== "admin") {
      return {
        success: false,
        message: "Insufficient permissions. Admin required.",
      };
    }

    // Delete existing mappings
    const { error: deleteError } = await supabase
      .from("integration_capabilities_map")
      .delete()
      .eq("integration_id", integrationId);

    if (deleteError) {
      logger.error("Failed to clear capability mappings", {
        integrationId,
        reason: deleteError.message,
      });
      return {
        success: false,
        message: "Failed to update capabilities.",
        error: deleteError.message,
      };
    }

    // Insert new mappings
    if (capabilityIds.length > 0) {
      const rows = capabilityIds.map((capabilityId) => ({
        integration_id: integrationId,
        capability_id: capabilityId,
      }));

      const { error: insertError } = await supabase
        .from("integration_capabilities_map")
        .insert(rows);

      if (insertError) {
        logger.error("Failed to insert capability mappings", {
          integrationId,
          reason: insertError.message,
        });
        return {
          success: false,
          message: "Failed to update capabilities.",
          error: insertError.message,
        };
      }
    }

    logger.info("Integration capabilities updated", {
      integrationId,
      count: capabilityIds.length,
    });

    return {
      success: true,
      message: `Capabilities updated (${capabilityIds.length} mapped).`,
      data: { replaced: true },
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to update integration capabilities.";
    return { success: false, message, error: message };
  }
}

// ─── discoverCapabilitiesForWorkspace ──────────────────────────

export async function discoverCapabilitiesForWorkspace(
  workspaceId: string
): Promise<ServiceResult<Capability[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    // Get all installed integrations for the workspace
    const { data: accounts, error: accError } = await supabase
      .from("integration_accounts")
      .select("integration_id")
      .eq("workspace_id", workspaceId);

    if (accError) {
      logger.error("Failed to fetch workspace integrations", {
        userId: profile.id,
        workspaceId,
        reason: accError.message,
      });
      return {
        success: false,
        message: "Failed to discover capabilities.",
        error: accError.message,
      };
    }

    const installedIds = (accounts ?? []).map((a) => a.integration_id);

    if (installedIds.length === 0) {
      return {
        success: true,
        message: "No integrations installed in workspace.",
        data: [],
      };
    }

    // Get all capability mappings for those integrations
    const { data: mappings, error: mapError } = await supabase
      .from("integration_capabilities_map")
      .select("capability_id, integration_capabilities(*)")
      .in("integration_id", installedIds);

    if (mapError) {
      logger.error("Failed to fetch capability mappings", {
        workspaceId,
        reason: mapError.message,
      });
      return {
        success: false,
        message: "Failed to discover capabilities.",
        error: mapError.message,
      };
    }

    // Deduplicate capabilities
    const seen = new Set<string>();
    const capabilities: Capability[] = [];

    for (const row of mappings ?? []) {
      const cap = row.integration_capabilities as unknown as Capability;
      if (cap && !seen.has(cap.id)) {
        seen.add(cap.id);
        capabilities.push(cap);
      }
    }

    return {
      success: true,
      message: `Discovered ${capabilities.length} unique capabilities across ${installedIds.length} integrations.`,
      data: capabilities,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to discover capabilities.";
    return { success: false, message, error: message };
  }
}
