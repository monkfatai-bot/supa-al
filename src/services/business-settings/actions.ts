"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";

export interface BusinessSettings {
  general?: {
    industry?: string;
    currency?: string;
    timezone?: string;
    fiscalYearStart?: string;
  };
  invoice?: {
    defaultTerms?: string;
    paymentTerms?: string;
    taxRate?: number;
    invoicePrefix?: string;
    autoNumbering?: boolean;
  };
  notifications?: {
    invoices?: boolean;
    contracts?: boolean;
    projects?: boolean;
    expenses?: boolean;
  };
  defaults?: {
    defaultPaymentMethod?: string;
    defaultCurrency?: string;
    defaultTaxRate?: number;
  };
}

export interface BusinessSettingsResponse {
  success: boolean;
  message: string;
  error?: string;
  settings?: BusinessSettings;
  workspaceName?: string;
}

/**
 * Get the business settings for a workspace (stored in workspaces.settings JSONB).
 */
export async function getBusinessSettings(
  workspaceId: string
): Promise<BusinessSettingsResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("name, settings")
    .eq("id", workspaceId)
    .single();

  if (error || !workspace) {
    return { success: false, message: "Workspace not found.", error: "NOT_FOUND" };
  }

  const rawSettings = workspace.settings as Record<string, unknown> | null;
  const settings: BusinessSettings = {
    general: (rawSettings?.general as BusinessSettings["general"]) ?? {
      industry: "",
      currency: "USD",
      timezone: "UTC",
      fiscalYearStart: "01",
    },
    invoice: (rawSettings?.invoice as BusinessSettings["invoice"]) ?? {
      defaultTerms: "",
      paymentTerms: "net_30",
      taxRate: 0,
      invoicePrefix: "INV",
      autoNumbering: true,
    },
    notifications: (rawSettings?.notifications as BusinessSettings["notifications"]) ?? {
      invoices: true,
      contracts: true,
      projects: true,
      expenses: true,
    },
    defaults: (rawSettings?.defaults as BusinessSettings["defaults"]) ?? {
      defaultPaymentMethod: "bank_transfer",
      defaultCurrency: "USD",
      defaultTaxRate: 0,
    },
  };

  return {
    success: true,
    message: "Settings retrieved.",
    settings,
    workspaceName: workspace.name,
  };
}

/**
 * Update the business settings for a workspace.
 */
export async function updateBusinessSettings(
  workspaceId: string,
  section: "general" | "invoice" | "notifications" | "defaults",
  data: BusinessSettings["general"] | BusinessSettings["invoice"] | BusinessSettings["notifications"] | BusinessSettings["defaults"]
): Promise<BusinessSettingsResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  if (!hasMinimumRole(membership.role as Role, "admin")) {
    return { success: false, message: "Only admins can update settings.", error: "FORBIDDEN" };
  }

  // Fetch current settings
  const { data: workspace, error: fetchError } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();

  if (fetchError || !workspace) {
    return { success: false, message: "Workspace not found.", error: "NOT_FOUND" };
  }

  const currentSettings = (workspace.settings as Record<string, unknown>) ?? {};
  const updatedSettings = {
    ...currentSettings,
    [section]: data,
  };

  const { error: updateError } = await supabase
    .from("workspaces")
    .update({ settings: updatedSettings })
    .eq("id", workspaceId);

  if (updateError) {
    return { success: false, message: "Failed to update settings.", error: "UPDATE_FAILED" };
  }

  return { success: true, message: "Settings updated." };
}
