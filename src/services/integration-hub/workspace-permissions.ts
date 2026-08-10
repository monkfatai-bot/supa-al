"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import {
  verifyWorkspaceMembership,
  requireMinimumRole,
} from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { Json } from "@/types/generated/database";
import type { IntegrationPermission } from "@/types/generated/database";
import type { ServiceResult } from "./types";

// ─── Local types ──────────────────────────────────────────────

type AccessMode = "read_only" | "full";

interface WorkspacePermissionPayload {
  accessMode: AccessMode;
  scopes: string[];
  departmentIds: string[];
  userIds: string[];
  aiEmployeeAccess: boolean;
  workflowAccess: boolean;
}

interface WorkspacePermissionRecord extends IntegrationPermission {
  /** Decoded structured payload stored in `permissions` JSON */
  workspacePermissions: WorkspacePermissionPayload;
}

interface AccessCheckContext {
  userId?: string;
  departmentId?: string;
  aiEmployeeId?: string;
  requiredScope?: string;
}

interface PermissionUpdate {
  integrationId: string;
  accessMode?: AccessMode;
  scopes?: string[];
  departmentIds?: string[];
  userIds?: string[];
  aiEmployeeAccess?: boolean;
  workflowAccess?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────

function defaultPayload(): WorkspacePermissionPayload {
  return {
    accessMode: "full",
    scopes: [],
    departmentIds: [],
    userIds: [],
    aiEmployeeAccess: false,
    workflowAccess: false,
  };
}

function decodePayload(raw: Json): WorkspacePermissionPayload {
  if (!raw || typeof raw !== "object") return defaultPayload();
  const obj = raw as Record<string, unknown>;
  return {
    accessMode:
      obj.accessMode === "read_only" || obj.accessMode === "full"
        ? obj.accessMode
        : "full",
    scopes: Array.isArray(obj.scopes)
      ? (obj.scopes as string[])
      : [],
    departmentIds: Array.isArray(obj.departmentIds)
      ? (obj.departmentIds as string[])
      : [],
    userIds: Array.isArray(obj.userIds)
      ? (obj.userIds as string[])
      : [],
    aiEmployeeAccess:
      typeof obj.aiEmployeeAccess === "boolean"
        ? obj.aiEmployeeAccess
        : false,
    workflowAccess:
      typeof obj.workflowAccess === "boolean"
        ? obj.workflowAccess
        : false,
  };
}

function enrichRecord(
  row: IntegrationPermission
): WorkspacePermissionRecord {
  return {
    ...row,
    workspacePermissions: decodePayload(row.permissions),
  };
}

// ─── getWorkspaceIntegrationPermissions ────────────────────────

export async function getWorkspaceIntegrationPermissions(
  workspaceId: string,
  integrationId: string
): Promise<ServiceResult<WorkspacePermissionRecord>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data, error } = await supabase
      .from("integration_permissions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .single();

    if (error && error.code !== "PGRST116") {
      logger.error("Failed to get workspace permissions", {
        userId: profile.id,
        workspaceId,
        integrationId,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to get workspace permissions.",
        error: error.message,
      };
    }

    const record = data
      ? enrichRecord(data as IntegrationPermission)
      : enrichRecord({
          id: "",
          workspace_id: workspaceId,
          integration_id: integrationId,
          permissions: {},
          granted_by: null,
          granted_at: new Date().toISOString(),
          revoked_at: null,
        });

    return {
      success: true,
      message: "Permissions retrieved.",
      data: record,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to get workspace permissions.";
    return { success: false, message, error: message };
  }
}

// ─── setWorkspaceIntegrationPermissions ────────────────────────

export async function setWorkspaceIntegrationPermissions(
  params: {
    workspaceId: string;
    integrationId: string;
    accessMode: AccessMode;
    scopes: string[];
    departmentIds: string[];
    userIds: string[];
    aiEmployeeAccess: boolean;
    workflowAccess: boolean;
  }
): Promise<ServiceResult<WorkspacePermissionRecord>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "admin");

    const payload: WorkspacePermissionPayload = {
      accessMode: params.accessMode,
      scopes: params.scopes,
      departmentIds: params.departmentIds,
      userIds: params.userIds,
      aiEmployeeAccess: params.aiEmployeeAccess,
      workflowAccess: params.workflowAccess,
    };

    const { data, error } = await supabase
      .from("integration_permissions")
      .upsert(
        {
          workspace_id: params.workspaceId,
          integration_id: params.integrationId,
          permissions: payload as unknown as Json,
          granted_by: profile.id,
          granted_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "workspace_id,integration_id" }
      )
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to set workspace permissions", {
        userId: profile.id,
        workspaceId: params.workspaceId,
        integrationId: params.integrationId,
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to set workspace permissions.",
        error: error?.message,
      };
    }

    logger.info("Workspace permissions set", {
      workspaceId: params.workspaceId,
      integrationId: params.integrationId,
    });

    return {
      success: true,
      message: "Permissions updated.",
      data: enrichRecord(data as IntegrationPermission),
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to set workspace permissions.";
    return { success: false, message, error: message };
  }
}

// ─── checkIntegrationAccess ────────────────────────────────────

export async function checkIntegrationAccess(
  workspaceId: string,
  integrationId: string,
  context: AccessCheckContext
): Promise<ServiceResult<{ granted: boolean; reason?: string }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data, error } = await supabase
      .from("integration_permissions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .single();

    // No permission record — deny by default
    if (error || !data) {
      return {
        success: true,
        message: "No permissions record found.",
        data: { granted: false, reason: "No permissions configured." },
      };
    }

    const perms = decodePayload(data.permissions);

    // Revoked check
    if (data.revoked_at) {
      return {
        success: true,
        message: "Integration access is revoked.",
        data: { granted: false, reason: "Permissions have been revoked." },
      };
    }

    // AI Employee access
    if (context.aiEmployeeId && !perms.aiEmployeeAccess) {
      return {
        success: true,
        message: "AI employee access denied.",
        data: {
          granted: false,
          reason: "AI employee access is not enabled.",
        },
      };
    }

    // User allowlist check
    if (
      context.userId &&
      perms.userIds.length > 0 &&
      !perms.userIds.includes(context.userId)
    ) {
      return {
        success: true,
        message: "User not in allowlist.",
        data: {
          granted: false,
          reason: "User is not in the access allowlist.",
        },
      };
    }

    // Department allowlist check
    if (
      context.departmentId &&
      perms.departmentIds.length > 0 &&
      !perms.departmentIds.includes(context.departmentId)
    ) {
      return {
        success: true,
        message: "Department not in allowlist.",
        data: {
          granted: false,
          reason: "Department is not in the access allowlist.",
        },
      };
    }

    // Scope check
    if (
      context.requiredScope &&
      perms.scopes.length > 0 &&
      !perms.scopes.includes(context.requiredScope)
    ) {
      return {
        success: true,
        message: "Required scope not granted.",
        data: {
          granted: false,
          reason: `Scope '${context.requiredScope}' is not granted.`,
        },
      };
    }

    return {
      success: true,
      message: "Access granted.",
      data: { granted: true },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to check integration access.";
    return { success: false, message, error: message };
  }
}

// ─── enableIntegration ────────────────────────────────────────

export async function enableIntegration(
  workspaceId: string,
  integrationId: string
): Promise<ServiceResult<{ enabled: boolean }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const { error } = await supabase
      .from("integration_accounts")
      .update({
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId);

    if (error) {
      logger.error("Failed to enable integration", {
        userId: profile.id,
        workspaceId,
        integrationId,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to enable integration.",
        error: error.message,
      };
    }

    // Clear any revoked_at on the permission record
    await supabase
      .from("integration_permissions")
      .update({ revoked_at: null })
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId);

    logger.info("Integration enabled", {
      workspaceId,
      integrationId,
      userId: profile.id,
    });

    return {
      success: true,
      message: "Integration enabled.",
      data: { enabled: true },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to enable integration.";
    return { success: false, message, error: message };
  }
}

// ─── disableIntegration ───────────────────────────────────────

export async function disableIntegration(
  workspaceId: string,
  integrationId: string
): Promise<ServiceResult<{ disabled: boolean }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const { error } = await supabase
      .from("integration_accounts")
      .update({
        status: "disabled",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId);

    if (error) {
      logger.error("Failed to disable integration", {
        userId: profile.id,
        workspaceId,
        integrationId,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to disable integration.",
        error: error.message,
      };
    }

    logger.info("Integration disabled (soft)", {
      workspaceId,
      integrationId,
      userId: profile.id,
    });

    return {
      success: true,
      message: "Integration disabled.",
      data: { disabled: true },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to disable integration.";
    return { success: false, message, error: message };
  }
}

// ─── listWorkspacePermissions ──────────────────────────────────

export async function listWorkspacePermissions(
  workspaceId: string
): Promise<ServiceResult<WorkspacePermissionRecord[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data, error } = await supabase
      .from("integration_permissions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("granted_at", { ascending: false });

    if (error) {
      logger.error("Failed to list workspace permissions", {
        userId: profile.id,
        workspaceId,
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to list workspace permissions.",
        error: error.message,
      };
    }

    const records = (data ?? []).map((row) =>
      enrichRecord(row as IntegrationPermission)
    );

    return {
      success: true,
      message: `Found ${records.length} permission records.`,
      data: records,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to list workspace permissions.";
    return { success: false, message, error: message };
  }
}

// ─── batchUpdatePermissions ────────────────────────────────────

export async function batchUpdatePermissions(
  workspaceId: string,
  updates: PermissionUpdate[]
): Promise<ServiceResult<{ updated: number }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    if (updates.length === 0) {
      return {
        success: true,
        message: "No updates to apply.",
        data: { updated: 0 },
      };
    }

    if (updates.length > 100) {
      return {
        success: false,
        message: "Batch size exceeds limit of 100.",
      };
    }

    let updated = 0;

    for (const update of updates) {
 // Fetch existing record to merge fields
      const { data: existing } = await supabase
        .from("integration_permissions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("integration_id", update.integrationId)
        .single();

      const current = existing
        ? decodePayload(existing.permissions)
        : defaultPayload();

      const merged: WorkspacePermissionPayload = {
        accessMode: update.accessMode ?? current.accessMode,
        scopes: update.scopes ?? current.scopes,
        departmentIds: update.departmentIds ?? current.departmentIds,
        userIds: update.userIds ?? current.userIds,
        aiEmployeeAccess:
          update.aiEmployeeAccess ?? current.aiEmployeeAccess,
        workflowAccess: update.workflowAccess ?? current.workflowAccess,
      };

      const { error } = await supabase
        .from("integration_permissions")
        .upsert(
          {
            workspace_id: workspaceId,
            integration_id: update.integrationId,
            permissions: merged as unknown as Json,
            granted_by: profile.id,
            granted_at: existing?.granted_at ?? new Date().toISOString(),
            revoked_at: null,
          },
          { onConflict: "workspace_id,integration_id" }
        );

      if (error) {
        logger.warn("Failed in batch — skipping item", {
          integrationId: update.integrationId,
          reason: error.message,
        });
        continue;
      }

      updated++;
    }

    logger.info("Batch permissions update completed", {
      workspaceId,
      requested: updates.length,
      updated,
    });

    return {
      success: true,
      message: `Updated ${updated} of ${updates.length} permission records.`,
      data: { updated },
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to batch update permissions.";
    return { success: false, message, error: message };
  }
}
