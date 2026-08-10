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
  Proposal,
  ProposalStatus,
  ProposalType,
  ActivityAction,
} from "@/types/generated/database";
import type {
  CreateProposalRequest,
  AiGenerateProposalRequest,
  ProposalWithCustomer,
  ProposalListResult,
  ProposalActionResponse,
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
 * Enrich a proposal row with the customer name if customer_id is present.
 */
async function enrichWithCustomer(
  proposal: Proposal
): Promise<ProposalWithCustomer> {
  if (!proposal.customer_id) {
    return { ...proposal, customer: null };
  }
  const customer = await fetchCustomerName(proposal.customer_id);
  return { ...proposal, customer };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new proposal.
 */
export async function createProposal(
  data: CreateProposalRequest
): Promise<ProposalActionResponse> {
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

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      workspace_id: data.workspaceId,
      customer_id: data.customerId ?? null,
      company_id: data.companyId ?? null,
      title: trimmedTitle,
      proposal_type: data.proposalType,
      content: data.content ?? "",
      summary: data.summary ?? "",
      value: data.value ?? 0,
      valid_until: data.validUntil ?? null,
      tags: data.tags ?? [],
      status: "draft" as ProposalStatus,
      issue_date: new Date().toISOString(),
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !proposal) {
    logger.error("Failed to create proposal", { reason: error?.message });
    return { success: false, message: "Failed to create proposal.", error: "CREATE_FAILED" };
  }

  logger.info("Proposal created", { proposalId: proposal.id });
  await logActivity(
    "proposal_create" as ActivityAction,
    `Created proposal: ${trimmedTitle}`,
    { proposalId: proposal.id, type: data.proposalType },
    data.workspaceId
  );
  void dispatchEvent({ eventName: 'proposal.created', workspaceId: data.workspaceId, userId: profile.id, payload: { proposalId: proposal.id, title: trimmedTitle }, timestamp: new Date().toISOString() }).catch(() => {});
  revalidatePath("/business");
  return { success: true, message: "Proposal created.", proposal };
}

/**
 * Update an existing proposal.
 */
export async function updateProposal(
  proposalId: string,
  updates: Partial<{
    title: string;
    proposalType: ProposalType;
    content: string;
    summary: string;
    value: number;
    validUntil: string | null;
    tags: string[];
    customerId: string | null;
    companyId: string | null;
  }>
): Promise<ProposalActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch existing proposal to verify workspace access
  const { data: existing } = await supabase
    .from("proposals")
    .select("workspace_id, title")
    .eq("id", proposalId)
    .single();

  if (!existing) {
    return { success: false, message: "Proposal not found.", error: "NOT_FOUND" };
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
  if (updates.proposalType !== undefined) dbUpdates.proposal_type = updates.proposalType;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.summary !== undefined) dbUpdates.summary = updates.summary;
  if (updates.value !== undefined) dbUpdates.value = updates.value;
  if (updates.validUntil !== undefined) dbUpdates.valid_until = updates.validUntil;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.customerId !== undefined) dbUpdates.customer_id = updates.customerId;
  if (updates.companyId !== undefined) dbUpdates.company_id = updates.companyId;

  if (Object.keys(dbUpdates).length === 0) {
    return { success: false, message: "No valid fields to update.", error: "NO_UPDATES" };
  }

  const { data: proposal, error } = await supabase
    .from("proposals")
    .update(dbUpdates)
    .eq("id", proposalId)
    .select()
    .single();

  if (error || !proposal) {
    logger.error("Failed to update proposal", { proposalId, reason: error?.message });
    return { success: false, message: "Failed to update proposal.", error: "UPDATE_FAILED" };
  }

  logger.info("Proposal updated", { proposalId });
  await logActivity(
    "proposal_update" as ActivityAction,
    `Updated proposal: ${existing.title}`,
    { proposalId, fields: Object.keys(dbUpdates) },
    existing.workspace_id
  );
  return { success: true, message: "Proposal updated.", proposal };
}

/**
 * Delete a proposal.
 */
export async function deleteProposal(
  proposalId: string
): Promise<ProposalActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("proposals")
    .select("workspace_id, title")
    .eq("id", proposalId)
    .single();

  if (!existing) {
    return { success: false, message: "Proposal not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const { error } = await supabase
    .from("proposals")
    .delete()
    .eq("id", proposalId);

  if (error) {
    logger.error("Failed to delete proposal", { proposalId, reason: error.message });
    return { success: false, message: "Failed to delete proposal.", error: "DELETE_FAILED" };
  }

  logger.info("Proposal deleted", { proposalId });
  await logActivity(
    "proposal_delete" as ActivityAction,
    `Deleted proposal: ${existing.title}`,
    { proposalId },
    existing.workspace_id
  );
  revalidatePath("/business");
  return { success: true, message: "Proposal deleted." };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get paginated proposals for a workspace with optional filters.
 */
export async function getProposals(
  workspaceId: string,
  filters?: {
    page?: number;
    pageSize?: number;
    status?: ProposalStatus;
    type?: ProposalType;
    search?: string;
  }
): Promise<ProposalListResult> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const memberCheck = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!memberCheck) {
    return { proposals: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters?.page ?? 1;
  const pageSize = Math.min(
    Math.max(filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, 1),
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("proposals")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.type) {
    query = query.eq("proposal_type", filters.type);
  }
  if (filters?.search) {
    const searchTerm = `%${filters.search}%`;
    query = query.or(`title.ilike.${searchTerm},summary.ilike.${searchTerm}`);
  }

  const { data, count, error } = await query;

  if (error || !data) {
    logger.error("Failed to fetch proposals", { workspaceId, reason: error?.message });
    return { proposals: [], total: 0, page, pageSize };
  }

  const enriched = await Promise.all(
    data.map((p) => enrichWithCustomer(p))
  );

  return { proposals: enriched, total: count ?? 0, page, pageSize };
}

/**
 * Get a single proposal by id.
 */
export async function getProposal(
  proposalId: string
): Promise<ProposalWithCustomer | null> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (error || !data) {
    logger.error("Failed to fetch proposal", { proposalId, reason: error?.message });
    return null;
  }

  // Verify workspace access
  const memberCheck = await verifyWorkspaceMembership(data.workspace_id, profile.id);
  if (!memberCheck) {
    return null;
  }

  return enrichWithCustomer(data);
}

// ---------------------------------------------------------------------------
// Status management
// ---------------------------------------------------------------------------

/**
 * Update a proposal's status.
 */
export async function updateProposalStatus(
  proposalId: string,
  status: ProposalStatus
): Promise<ProposalActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("proposals")
    .select("workspace_id, title, status")
    .eq("id", proposalId)
    .single();

  if (!existing) {
    return { success: false, message: "Proposal not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const validTransitions: Record<ProposalStatus, ProposalStatus[]> = {
    draft: ["sent", "expired"],
    sent: ["viewed", "accepted", "rejected", "expired"],
    viewed: ["accepted", "rejected", "expired"],
    accepted: [],
    rejected: ["draft"],
    expired: ["draft"],
  };

  const allowed = validTransitions[existing.status as ProposalStatus];
  if (!allowed.includes(status)) {
    return {
      success: false,
      message: `Cannot transition from ${existing.status} to ${status}.`,
      error: "INVALID_TRANSITION",
    };
  }

  const { data: proposal, error } = await supabase
    .from("proposals")
    .update({ status })
    .eq("id", proposalId)
    .select()
    .single();

  if (error || !proposal) {
    logger.error("Failed to update proposal status", { proposalId, reason: error?.message });
    return { success: false, message: "Failed to update proposal status.", error: "UPDATE_FAILED" };
  }

  logger.info("Proposal status updated", { proposalId, status });
  await logActivity(
    "proposal_status_change" as ActivityAction,
    `Proposal "${existing.title}" status changed: ${existing.status} → ${status}`,
    { proposalId, from: existing.status, to: status },
    existing.workspace_id
  );
  if (status === 'accepted') {
    void createNotification(profile.id, 'success', 'Proposal Accepted', `${existing.title} has been accepted`, '/business/proposals').catch(() => {});
  }
  return { success: true, message: "Proposal status updated.", proposal };
}

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------

/**
 * Use AI to generate a professional proposal, then save it to the database.
 */
export async function aiGenerateProposal(
  data: AiGenerateProposalRequest
): Promise<ProposalActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const memberCheck = await verifyWorkspaceMembership(data.workspaceId, profile.id);
  if (!memberCheck) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const tone = data.tone ?? "professional";
  const systemPrompt = `You are a professional business proposal writer. Always respond with valid JSON containing exactly two fields: "content" (the full proposal body in markdown) and "summary" (a 1-2 sentence executive summary). Do not include any text outside the JSON object.`;

  const userPrompt = [
    `Generate a professional ${data.type} proposal based on the following description:`,
    data.prompt,
    ``,
    `Tone: ${tone}`,
    `Proposal Type: ${data.type}`,
    `The "content" field should be a detailed, well-structured markdown proposal with sections like Executive Summary, Scope, Deliverables, Timeline, and Pricing (if applicable).`,
    `The "summary" field should be a concise 1-2 sentence overview.`,
  ].join("\n");

  let aiContent: string;
  let aiSummary: string;

  try {
    const response = await sendChatMessage({
      model: getDefaultModel().id,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 4096,
    });

    // Parse the AI response as JSON
    const parsed = JSON.parse(response.content.trim());
    aiContent = typeof parsed.content === "string" ? parsed.content : response.content;
    aiSummary = typeof parsed.summary === "string" ? parsed.summary : "";
  } catch (err) {
    logger.error("AI proposal generation failed", {
      workspaceId: data.workspaceId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      message: "Failed to generate proposal with AI.",
      error: "AI_GENERATION_FAILED",
    };
  }

  const title = `${data.type.charAt(0).toUpperCase() + data.type.slice(1)} Proposal — ${new Date().toLocaleDateString()}`;

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      workspace_id: data.workspaceId,
      customer_id: data.customerId ?? null,
      company_id: null,
      title,
      proposal_type: data.type,
      content: aiContent,
      summary: aiSummary,
      value: 0,
      valid_until: null,
      tags: ["ai-generated"],
      status: "draft" as ProposalStatus,
      issue_date: new Date().toISOString(),
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !proposal) {
    logger.error("Failed to save AI-generated proposal", { reason: error?.message });
    return { success: false, message: "Failed to save generated proposal.", error: "CREATE_FAILED" };
  }

  logger.info("AI proposal generated", { proposalId: proposal.id });
  await logActivity(
    "proposal_ai_generate" as ActivityAction,
    `AI-generated proposal: ${title}`,
    { proposalId: proposal.id },
    data.workspaceId
  );
  return { success: true, message: "AI proposal generated.", proposal };
}

// ---------------------------------------------------------------------------
// Convert proposal to contract
// ---------------------------------------------------------------------------

/**
 * Convert an accepted proposal into a contract.
 */
export async function convertProposalToContract(
  proposalId: string
): Promise<ProposalActionResponse & { contractId?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: proposal, error: fetchError } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (fetchError || !proposal) {
    return { success: false, message: "Proposal not found.", error: "NOT_FOUND" };
  }

  if (proposal.status !== "accepted") {
    return {
      success: false,
      message: "Only accepted proposals can be converted to contracts.",
      error: "INVALID_STATUS",
    };
  }

  if (proposal.converted_contract_id) {
    return {
      success: false,
      message: "Proposal has already been converted to a contract.",
      error: "ALREADY_CONVERTED",
    };
  }

  const memberCheck = await verifyWorkspaceMembership(proposal.workspace_id, profile.id);
  if (!memberCheck) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Create the contract
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .insert({
      workspace_id: proposal.workspace_id,
      customer_id: proposal.customer_id,
      company_id: proposal.company_id,
      title: `Contract — ${proposal.title}`,
      contract_type: "service",
      status: "draft",
      content: proposal.content,
      summary: proposal.summary,
      terms: "",
      variables: {},
      version_number: 1,
      value: proposal.value,
      start_date: new Date().toISOString(),
      end_date: null,
      tags: [...proposal.tags, "from-proposal"],
      created_by: profile.id,
    })
    .select()
    .single();

  if (contractError || !contract) {
    logger.error("Failed to create contract from proposal", {
      proposalId,
      reason: contractError?.message,
    });
    return { success: false, message: "Failed to create contract.", error: "CREATE_FAILED" };
  }

  // Create initial contract version
  await supabase.from("contract_versions").insert({
    contract_id: contract.id,
    version_number: 1,
    content: contract.content,
    summary: contract.summary,
    change_summary: "Initial version converted from proposal",
    created_by: profile.id,
  });

  // Update proposal with converted_contract_id
  await supabase
    .from("proposals")
    .update({ converted_contract_id: contract.id })
    .eq("id", proposalId);

  logger.info("Proposal converted to contract", { proposalId, contractId: contract.id });
  await logActivity(
    "proposal_convert_to_contract" as ActivityAction,
    `Converted proposal "${proposal.title}" to contract`,
    { proposalId, contractId: contract.id },
    proposal.workspace_id
  );
  revalidatePath("/business");
  return { success: true, message: "Proposal converted to contract.", proposal, contractId: contract.id };
}
