"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { dispatchEvent } from "@/services/automation/triggers";
import { createNotification } from "@/services/notification/actions";
import { hasMinimumRole } from "@/services/rbac/permissions";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import type { Role } from "@/services/rbac/types";
import { sendChatMessage } from "@/services/ai/service";
import { getDefaultModel } from "@/services/ai/models";
import { PAGINATION } from "@/config/constants";
import { revalidatePath } from "next/cache";
import type {
  Contract,
  ContractStatus,
  ContractType,
  ContractVersion,
  Json,
  ActivityAction,
} from "@/types/generated/database";
import type {
  CreateContractRequest,
  AiDraftContractRequest,
  ContractWithRelations,
  ContractListResult,
  ContractActionResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------



/**
 * Fetch customer name for a given customer id.
 */
async function fetchCustomerName(
  customerId: string
): Promise<{ name: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("customers")
    .select("name")
    .eq("id", customerId)
    .single();
  return data ?? null;
}

/**
 * Enrich a contract row with customer name.
 */
async function enrichWithCustomer(
  contract: Contract
): Promise<ContractWithRelations> {
  if (!contract.customer_id) {
    return { ...contract, customer: null, versions: [] };
  }
  const customer = await fetchCustomerName(contract.customer_id);
  return { ...contract, customer, versions: [] };
}

/**
 * Determine the contract type label for AI prompts.
 */
function getContractTypeLabel(type: ContractType): string {
  const labels: Record<ContractType, string> = {
    nda: "Non-Disclosure Agreement (NDA)",
    employment: "Employment Agreement",
    freelance: "Freelance Agreement",
    service: "Service Agreement",
    partnership: "Partnership Agreement",
    consulting: "Consulting Agreement",
    purchase: "Purchase Agreement",
  };
  return labels[type] ?? type;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new contract along with its initial version (version 1).
 */
export async function createContract(
  data: CreateContractRequest
): Promise<ContractActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(data.workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const trimmedTitle = data.title.trim();
  if (!trimmedTitle || trimmedTitle.length > 300) {
    return {
      success: false,
      message: "Title is required (max 300 characters).",
      error: "INVALID_INPUT",
    };
  }

  const contractContent = data.content ?? "";
  const contractSummary = data.summary ?? "";

  // Create the contract
  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      workspace_id: data.workspaceId,
      customer_id: data.customerId ?? null,
      company_id: data.companyId ?? null,
      title: trimmedTitle,
      contract_type: data.contractType,
      status: "draft" as ContractStatus,
      content: contractContent,
      summary: contractSummary,
      terms: data.terms ?? "",
      variables: data.variables ?? {},
      version_number: 1,
      value: data.value ?? 0,
      start_date: data.startDate ?? null,
      end_date: data.endDate ?? null,
      tags: data.tags ?? [],
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !contract) {
    logger.error("Failed to create contract", { reason: error?.message });
    return { success: false, message: "Failed to create contract.", error: "CREATE_FAILED" };
  }

  // Create initial contract version
  const { error: versionError } = await supabase
    .from("contract_versions")
    .insert({
      contract_id: contract.id,
      version_number: 1,
      content: contractContent,
      summary: contractSummary,
      change_summary: "Initial version",
      created_by: profile.id,
    });

  if (versionError) {
    logger.warn("Failed to create initial contract version", {
      contractId: contract.id,
      reason: versionError.message,
    });
  }

  logger.info("Contract created", { contractId: contract.id });
  await logActivity(
    "contract_create" as ActivityAction,
    `Created contract: ${trimmedTitle}`,
    { contractId: contract.id, type: data.contractType },
    data.workspaceId
  );
  void dispatchEvent({ eventName: 'contract.created', workspaceId: data.workspaceId, userId: profile.id, payload: { contractId: contract.id, title: trimmedTitle }, timestamp: new Date().toISOString() }).catch(() => {});
  revalidatePath("/business");
  return { success: true, message: "Contract created.", contract };
}

/**
 * Update an existing contract.
 */
export async function updateContract(
  contractId: string,
  updates: Partial<{
    title: string;
    contractType: ContractType;
    content: string;
    summary: string;
    terms: string;
    variables: Json;
    value: number;
    startDate: string | null;
    endDate: string | null;
    tags: string[];
    customerId: string | null;
    companyId: string | null;
  }>
): Promise<ContractActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("contracts")
    .select("workspace_id, title")
    .eq("id", contractId)
    .single();

  if (!existing) {
    return { success: false, message: "Contract not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const dbUpdates: Record<string, unknown> = {};
  if (updates.title !== undefined) {
    const trimmed = updates.title.trim();
    if (!trimmed || trimmed.length > 300) {
      return { success: false, message: "Title is required (max 300 characters).", error: "INVALID_INPUT" };
    }
    dbUpdates.title = trimmed;
  }
  if (updates.contractType !== undefined) dbUpdates.contract_type = updates.contractType;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.summary !== undefined) dbUpdates.summary = updates.summary;
  if (updates.terms !== undefined) dbUpdates.terms = updates.terms;
  if (updates.variables !== undefined) dbUpdates.variables = updates.variables;
  if (updates.value !== undefined) dbUpdates.value = updates.value;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.customerId !== undefined) dbUpdates.customer_id = updates.customerId;
  if (updates.companyId !== undefined) dbUpdates.company_id = updates.companyId;

  if (Object.keys(dbUpdates).length === 0) {
    return { success: false, message: "No valid fields to update.", error: "NO_UPDATES" };
  }

  const { data: contract, error } = await supabase
    .from("contracts")
    .update(dbUpdates)
    .eq("id", contractId)
    .select()
    .single();

  if (error || !contract) {
    logger.error("Failed to update contract", { contractId, reason: error?.message });
    return { success: false, message: "Failed to update contract.", error: "UPDATE_FAILED" };
  }

  logger.info("Contract updated", { contractId });
  await logActivity(
    "contract_update" as ActivityAction,
    `Updated contract: ${existing.title}`,
    { contractId, fields: Object.keys(dbUpdates) },
    existing.workspace_id
  );
  return { success: true, message: "Contract updated.", contract };
}

/**
 * Delete a contract and its versions.
 */
export async function deleteContract(
  contractId: string
): Promise<ContractActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("contracts")
    .select("workspace_id, title")
    .eq("id", contractId)
    .single();

  if (!existing) {
    return { success: false, message: "Contract not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  // Delete contract versions first (cascade would handle this, but be explicit)
  await supabase.from("contract_versions").delete().eq("contract_id", contractId);

  const { error } = await supabase
    .from("contracts")
    .delete()
    .eq("id", contractId);

  if (error) {
    logger.error("Failed to delete contract", { contractId, reason: error.message });
    return { success: false, message: "Failed to delete contract.", error: "DELETE_FAILED" };
  }

  logger.info("Contract deleted", { contractId });
  await logActivity(
    "contract_delete" as ActivityAction,
    `Deleted contract: ${existing.title}`,
    { contractId },
    existing.workspace_id
  );
  revalidatePath("/business");
  return { success: true, message: "Contract deleted." };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get paginated contracts for a workspace with optional filters.
 */
export async function getContracts(
  workspaceId: string,
  filters?: {
    page?: number;
    pageSize?: number;
    status?: ContractStatus;
    type?: ContractType;
    search?: string;
  }
): Promise<ContractListResult> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const memberCheck = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!memberCheck) {
    return { contracts: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters?.page ?? 1;
  const pageSize = Math.min(
    Math.max(filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, 1),
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("contracts")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.type) {
    query = query.eq("contract_type", filters.type);
  }
  if (filters?.search) {
    const searchTerm = `%${filters.search}%`;
    query = query.or(`title.ilike.${searchTerm},summary.ilike.${searchTerm}`);
  }

  const { data, count, error } = await query;

  if (error || !data) {
    logger.error("Failed to fetch contracts", { workspaceId, reason: error?.message });
    return { contracts: [], total: 0, page, pageSize };
  }

  const enriched = await Promise.all(
    data.map((c) => enrichWithCustomer(c))
  );

  return { contracts: enriched, total: count ?? 0, page, pageSize };
}

/**
 * Get a single contract by id with its version history.
 */
export async function getContract(
  contractId: string
): Promise<ContractWithRelations | null> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (error || !contract) {
    logger.error("Failed to fetch contract", { contractId, reason: error?.message });
    return null;
  }

  const memberCheck = await verifyWorkspaceMembership(contract.workspace_id, profile.id);
  if (!memberCheck) {
    return null;
  }

  // Fetch versions ordered by version_number DESC
  const { data: versions } = await supabase
    .from("contract_versions")
    .select("*")
    .eq("contract_id", contractId)
    .order("version_number", { ascending: false });

  // Enrich with customer name
  let customer: { name: string } | null = null;
  if (contract.customer_id) {
    customer = await fetchCustomerName(contract.customer_id);
  }

  return { ...contract, customer, versions: versions ?? [] };
}

// ---------------------------------------------------------------------------
// Status management
// ---------------------------------------------------------------------------

/**
 * Update a contract's status.
 */
export async function updateContractStatus(
  contractId: string,
  status: ContractStatus
): Promise<ContractActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("contracts")
    .select("workspace_id, title, status")
    .eq("id", contractId)
    .single();

  if (!existing) {
    return { success: false, message: "Contract not found.", error: "NOT_FOUND" };
  }

  const memberCheck = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!memberCheck) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const validTransitions: Record<ContractStatus, ContractStatus[]> = {
    draft: ["pending_review", "cancelled"],
    pending_review: ["active", "draft", "cancelled"],
    active: ["expired", "terminated"],
    expired: ["active", "cancelled"],
    terminated: [],
    cancelled: ["draft"],
  };

  const allowed = validTransitions[existing.status as ContractStatus];
  if (!allowed.includes(status)) {
    return {
      success: false,
      message: `Cannot transition from ${existing.status} to ${status}.`,
      error: "INVALID_TRANSITION",
    };
  }

  const { data: contract, error } = await supabase
    .from("contracts")
    .update({ status })
    .eq("id", contractId)
    .select()
    .single();

  if (error || !contract) {
    logger.error("Failed to update contract status", { contractId, reason: error?.message });
    return { success: false, message: "Failed to update contract status.", error: "UPDATE_FAILED" };
  }

  logger.info("Contract status updated", { contractId, status });
  await logActivity(
    "contract_status_change" as ActivityAction,
    `Contract "${existing.title}" status changed: ${existing.status} → ${status}`,
    { contractId, from: existing.status, to: status },
    existing.workspace_id
  );
  return { success: true, message: "Contract status updated.", contract };
}

/**
 * Approve a contract — sets status to active, records approver, and creates a new version.
 */
export async function approveContract(
  contractId: string
): Promise<ContractActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Contract not found.", error: "NOT_FOUND" };
  }

  if (existing.status !== "pending_review") {
    return {
      success: false,
      message: "Only contracts in pending_review status can be approved.",
      error: "INVALID_STATUS",
    };
  }

  const membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  // Determine the next version number
  const { data: latestVersion } = await supabase
    .from("contract_versions")
    .select("version_number")
    .eq("contract_id", contractId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

  // Update contract: set active, record approver and timestamp, increment version
  const { data: contract, error } = await supabase
    .from("contracts")
    .update({
      status: "active" as ContractStatus,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      version_number: nextVersionNumber,
    })
    .eq("id", contractId)
    .select()
    .single();

  if (error || !contract) {
    logger.error("Failed to approve contract", { contractId, reason: error?.message });
    return { success: false, message: "Failed to approve contract.", error: "UPDATE_FAILED" };
  }

  // Create new version entry for the approved version
  const { error: versionError } = await supabase
    .from("contract_versions")
    .insert({
      contract_id: contractId,
      version_number: nextVersionNumber,
      content: contract.content,
      summary: contract.summary,
      change_summary: `Contract approved by ${profile.full_name ?? profile.id}`,
      created_by: profile.id,
    });

  if (versionError) {
    logger.warn("Failed to create approved contract version", {
      contractId,
      reason: versionError.message,
    });
  }

  logger.info("Contract approved", { contractId, approvedBy: profile.id });
  await logActivity(
    "contract_approve" as ActivityAction,
    `Approved contract: ${existing.title}`,
    { contractId, versionNumber: nextVersionNumber },
    existing.workspace_id
  );
  void dispatchEvent({ eventName: 'contract.approved', workspaceId: existing.workspace_id, userId: profile.id, payload: { contractId }, timestamp: new Date().toISOString() }).catch(() => {});
  void createNotification(profile.id, "success", "Contract Approved", `${existing.title} has been approved`, "/business/contracts").catch(() => {});
  revalidatePath("/business");
  return { success: true, message: "Contract approved.", contract };
}

// ---------------------------------------------------------------------------
// Version management
// ---------------------------------------------------------------------------

/**
 * Create a new version of a contract with updated content.
 */
export async function createContractVersion(
  contractId: string,
  params: {
    content: string;
    changeSummary: string;
  }
): Promise<ContractActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (fetchError || !existing) {
    return { success: false, message: "Contract not found.", error: "NOT_FOUND" };
  }

  const memberCheck = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!memberCheck) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Get the current latest version number
  const { data: latestVersion } = await supabase
    .from("contract_versions")
    .select("version_number")
    .eq("contract_id", contractId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

  // Insert the new version row
  const { error: versionError } = await supabase
    .from("contract_versions")
    .insert({
      contract_id: contractId,
      version_number: nextVersionNumber,
      content: params.content,
      summary: existing.summary,
      change_summary: params.changeSummary,
      created_by: profile.id,
    });

  if (versionError) {
    logger.error("Failed to create contract version", {
      contractId,
      reason: versionError.message,
    });
    return { success: false, message: "Failed to create contract version.", error: "CREATE_FAILED" };
  }

  // Update the contract with the new content and version number
  const { data: contract, error } = await supabase
    .from("contracts")
    .update({
      content: params.content,
      version_number: nextVersionNumber,
      status: "pending_review" as ContractStatus,
    })
    .eq("id", contractId)
    .select()
    .single();

  if (error || !contract) {
    logger.error("Failed to update contract after versioning", {
      contractId,
      reason: error?.message,
    });
    return { success: false, message: "Failed to update contract.", error: "UPDATE_FAILED" };
  }

  logger.info("Contract version created", {
    contractId,
    versionNumber: nextVersionNumber,
  });
  await logActivity(
    "contract_version_create" as ActivityAction,
    `Created version ${nextVersionNumber} of "${existing.title}"`,
    { contractId, versionNumber: nextVersionNumber },
    existing.workspace_id
  );
  return { success: true, message: "Contract version created.", contract };
}

/**
 * Get the full version history for a contract.
 */
export async function getContractVersionHistory(
  contractId: string
): Promise<ContractVersion[]> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: contract } = await supabase
    .from("contracts")
    .select("workspace_id")
    .eq("id", contractId)
    .single();

  if (!contract) {
    return [];
  }

  const memberCheck = await verifyWorkspaceMembership(contract.workspace_id, profile.id);
  if (!memberCheck) {
    return [];
  }

  const { data, error } = await supabase
    .from("contract_versions")
    .select("*")
    .eq("contract_id", contractId)
    .order("version_number", { ascending: false });

  if (error || !data) {
    logger.error("Failed to fetch contract version history", {
      contractId,
      reason: error?.message,
    });
    return [];
  }

  return data;
}

// ---------------------------------------------------------------------------
// AI draft
// ---------------------------------------------------------------------------

/**
 * Use AI to draft a contract based on type and description, then save it.
 */
export async function aiDraftContract(
  data: AiDraftContractRequest
): Promise<ContractActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const memberCheck = await verifyWorkspaceMembership(data.workspaceId, profile.id);
  if (!memberCheck) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const typeLabel = getContractTypeLabel(data.contractType);
  const partiesText = data.parties?.length
    ? `Parties involved: ${data.parties.join(", ")}.`
    : "";

  const systemPrompt = `You are a professional legal contract drafter. Always respond with valid JSON containing exactly two fields: "content" (the full contract text in markdown) and "summary" (a 1-2 sentence summary). Do not include any text outside the JSON object.`;

  let userPrompt = "";
  switch (data.contractType) {
    case "nda":
      userPrompt = [
        `Draft a comprehensive Non-Disclosure Agreement (NDA).`,
        `Description: ${data.description}`,
        partiesText,
        ``,
        `Include the following sections:`,
        `- Definition of Confidential Information`,
        `- Obligations of Receiving Party`,
        `- Exclusions from Confidential Information`,
        `- Term and Duration`,
        `- Return of Materials`,
        `- Remedies`,
        `- Governing Law`,
        ``,
        `The "content" field should be the complete NDA text in markdown format.`,
        `The "summary" field should be a brief 1-2 sentence overview.`,
      ].join("\n");
      break;

    case "service":
      userPrompt = [
        `Draft a professional Service Agreement.`,
        `Description: ${data.description}`,
        partiesText,
        ``,
        `Include the following sections:`,
        `- Scope of Services`,
        `- Deliverables and Timeline`,
        `- Fees and Payment Terms`,
        `- Intellectual Property`,
        `- Confidentiality`,
        `- Term and Termination`,
        `- Limitation of Liability`,
        `- Governing Law`,
        ``,
        `The "content" field should be the complete agreement text in markdown format.`,
        `The "summary" field should be a brief 1-2 sentence overview.`,
      ].join("\n");
      break;

    case "employment":
      userPrompt = [
        `Draft a professional Employment Agreement.`,
        `Description: ${data.description}`,
        partiesText,
        ``,
        `Include sections for: Position and Duties, Compensation, Benefits, Confidentiality, Termination, and Governing Law.`,
        `The "content" field should be the complete agreement in markdown.`,
        `The "summary" field should be a brief 1-2 sentence overview.`,
      ].join("\n");
      break;

    case "freelance":
      userPrompt = [
        `Draft a professional Freelance/Independent Contractor Agreement.`,
        `Description: ${data.description}`,
        partiesText,
        ``,
        `Include sections for: Scope of Work, Payment Terms, Deliverables, Timeline, IP Rights, Confidentiality, and Termination.`,
        `The "content" field should be the complete agreement in markdown.`,
        `The "summary" field should be a brief 1-2 sentence overview.`,
      ].join("\n");
      break;

    case "partnership":
      userPrompt = [
        `Draft a professional Partnership Agreement.`,
        `Description: ${data.description}`,
        partiesText,
        ``,
        `Include sections for: Partnership Purpose, Contributions, Profit Sharing, Management, Dissolution, and Governing Law.`,
        `The "content" field should be the complete agreement in markdown.`,
        `The "summary" field should be a brief 1-2 sentence overview.`,
      ].join("\n");
      break;

    case "consulting":
      userPrompt = [
        `Draft a professional Consulting Agreement.`,
        `Description: ${data.description}`,
        partiesText,
        ``,
        `Include sections for: Consulting Services, Fees and Expenses, Term, Independent Contractor Status, Confidentiality, IP Rights, and Termination.`,
        `The "content" field should be the complete agreement in markdown.`,
        `The "summary" field should be a brief 1-2 sentence overview.`,
      ].join("\n");
      break;

    case "purchase":
      userPrompt = [
        `Draft a professional Purchase Agreement.`,
        `Description: ${data.description}`,
        partiesText,
        ``,
        `Include sections for: Purchase Description, Price and Payment, Delivery Terms, Inspection, Warranties, Risk of Loss, and Governing Law.`,
        `The "content" field should be the complete agreement in markdown.`,
        `The "summary" field should be a brief 1-2 sentence overview.`,
      ].join("\n");
      break;

    default:
      userPrompt = [
        `Draft a professional ${typeLabel}.`,
        `Description: ${data.description}`,
        partiesText,
        ``,
        `The "content" field should be the complete agreement in markdown format.`,
        `The "summary" field should be a brief 1-2 sentence overview.`,
      ].join("\n");
  }

  let aiContent: string;
  let aiSummary: string;

  try {
    const response = await sendChatMessage({
      model: getDefaultModel().id,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 8192,
    });

    const parsed = JSON.parse(response.content.trim());
    aiContent = typeof parsed.content === "string" ? parsed.content : response.content;
    aiSummary = typeof parsed.summary === "string" ? parsed.summary : "";
  } catch (err) {
    logger.error("AI contract draft failed", {
      workspaceId: data.workspaceId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      message: "Failed to draft contract with AI.",
      error: "AI_GENERATION_FAILED",
    };
  }

  const title = `${typeLabel} — ${new Date().toLocaleDateString()}`;

  // Create the contract with initial version
  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      workspace_id: data.workspaceId,
      customer_id: null,
      company_id: null,
      title,
      contract_type: data.contractType,
      status: "draft" as ContractStatus,
      content: aiContent,
      summary: aiSummary,
      terms: "",
      variables: {},
      version_number: 1,
      value: 0,
      start_date: null,
      end_date: null,
      tags: ["ai-generated"],
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !contract) {
    logger.error("Failed to save AI-drafted contract", { reason: error?.message });
    return { success: false, message: "Failed to save drafted contract.", error: "CREATE_FAILED" };
  }

  // Create initial version
  await supabase.from("contract_versions").insert({
    contract_id: contract.id,
    version_number: 1,
    content: aiContent,
    summary: aiSummary,
    change_summary: "Initial AI-drafted version",
    created_by: profile.id,
  });

  logger.info("AI contract drafted", { contractId: contract.id });
  await logActivity(
    "contract_ai_draft" as ActivityAction,
    `AI-drafted contract: ${title}`,
    { contractId: contract.id, type: data.contractType },
    data.workspaceId
  );
  return { success: true, message: "AI contract drafted.", contract };
}
