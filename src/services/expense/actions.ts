"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logActivity } from "@/services/activity-log/actions";
import { dispatchEvent } from "@/services/automation/triggers";
import { createNotification } from "@/services/notification/actions";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";
import { logger } from "@/services/logger";
import { PAGINATION } from "@/config/constants";
import { sendChatMessage } from "@/services/ai/service";
import type { Expense, ActivityAction } from "@/types/generated/database";
import type {
  CreateExpenseRequest,
  ExpenseWithBudget,
  ExpenseDashboardStats,
  AiCategorizeRequest,
  AiCategorizeResult,
  ExpenseListResponse,
  ExpenseListFilters,
  ExpenseActionResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify the user is a member of the given workspace. */
async function verifyWorkspaceAccess(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  workspaceId: string
) {
  const { data } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();
  return data;
}

/** Enrich an expense row with its budget info (if linked). */
async function enrichWithBudget(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  expense: Expense
): Promise<ExpenseWithBudget> {
  if (!expense.budget_id) {
    return expense as ExpenseWithBudget;
  }

  const { data: budget } = await supabase
    .from("budgets")
    .select("name, amount, spent")
    .eq("id", expense.budget_id)
    .single();

  return {
    ...expense,
    budget: budget
      ? { name: budget.name, amount: budget.amount, spent: budget.spent }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Create Expense
// ---------------------------------------------------------------------------

export async function createExpense(
  data: CreateExpenseRequest
): Promise<ExpenseActionResponse & { expense?: Expense }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (!data.workspaceId || !data.category || typeof data.amount !== "number" || data.amount <= 0) {
    return { success: false, message: "workspaceId, category, and a positive amount are required.", error: "INVALID_INPUT" };
  }

  const membership = await verifyWorkspaceAccess(supabase, profile.id, data.workspaceId);
  if (!membership) {
    return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const insertPayload = {
    workspace_id: data.workspaceId,
    category: data.category.trim(),
    amount: data.amount,
    currency: data.currency ?? "USD",
    description: data.description?.trim() ?? "",
    vendor: data.vendor?.trim() ?? "",
    expense_date: data.expenseDate ?? new Date().toISOString().split("T")[0],
    receipt_url: data.receiptUrl ?? "",
    status: "pending" as const,
    tags: data.tags ?? [],
    ai_categorized: false,
    created_by: profile.id,
  };

  const { data: expense, error } = await supabase
    .from("expenses")
    .insert(insertPayload)
    .select()
    .single();

  if (error || !expense) {
    logger.error("Failed to create expense", { reason: error?.message });
    return { success: false, message: "Failed to create expense.", error: "CREATE_FAILED" };
  }

  logger.info("Expense created", { expenseId: expense.id, amount: data.amount });
  await logActivity(
    "expense_create" as ActivityAction,
    `Created expense: ${data.category} - ${data.amount}`,
    { expenseId: expense.id, amount: data.amount, category: data.category },
    data.workspaceId
  );
  void dispatchEvent({ eventName: 'expense.created', workspaceId: data.workspaceId, userId: profile.id, payload: { expenseId: expense.id, amount: data.amount, category: data.category }, timestamp: new Date().toISOString() }).catch(() => {});

  return { success: true, message: "Expense created.", expense };
}

// ---------------------------------------------------------------------------
// Update Expense
// ---------------------------------------------------------------------------

export async function updateExpense(
  id: string,
  updates: {
    category?: string;
    amount?: number;
    currency?: string;
    description?: string;
    vendor?: string;
    expenseDate?: string;
    receiptUrl?: string;
    tags?: string[];
    budgetId?: string | null;
  }
): Promise<ExpenseActionResponse & { expense?: Expense }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("expenses")
    .select("id, workspace_id, status")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Expense not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceAccess(supabase, profile.id, existing.workspace_id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.category !== undefined) dbUpdates.category = updates.category.trim();
  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
  if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.vendor !== undefined) dbUpdates.vendor = updates.vendor;
  if (updates.expenseDate !== undefined) dbUpdates.expense_date = updates.expenseDate;
  if (updates.receiptUrl !== undefined) dbUpdates.receipt_url = updates.receiptUrl;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.budgetId !== undefined) dbUpdates.budget_id = updates.budgetId;

  const { data: expense, error } = await supabase
    .from("expenses")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error || !expense) {
    logger.error("Failed to update expense", { id, reason: error?.message });
    return { success: false, message: "Failed to update expense.", error: "UPDATE_FAILED" };
  }

  logger.info("Expense updated", { expenseId: id });
  await logActivity(
    "expense_update" as ActivityAction,
    `Updated expense: ${expense.category} - ${expense.amount}`,
    { expenseId: id },
    existing.workspace_id
  );

  return { success: true, message: "Expense updated.", expense };
}

// ---------------------------------------------------------------------------
// Delete Expense
// ---------------------------------------------------------------------------

export async function deleteExpense(
  id: string
): Promise<ExpenseActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("expenses")
    .select("id, workspace_id, category, amount")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Expense not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceAccess(supabase, profile.id, existing.workspace_id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const { error } = await supabase.from("expenses").delete().eq("id", id);

  if (error) {
    logger.error("Failed to delete expense", { id, reason: error.message });
    return { success: false, message: "Failed to delete expense.", error: "DELETE_FAILED" };
  }

  logger.info("Expense deleted", { expenseId: id });
  await logActivity(
    "expense_delete" as ActivityAction,
    `Deleted expense: ${existing.category} - ${existing.amount}`,
    { expenseId: id },
    existing.workspace_id
  );

  return { success: true, message: "Expense deleted." };
}

// ---------------------------------------------------------------------------
// Get Expenses (paginated, filterable)
// ---------------------------------------------------------------------------

export async function getExpenses(
  workspaceId: string,
  filters: ExpenseListFilters = {}
): Promise<ExpenseListResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const hasAccess = await verifyWorkspaceAccess(supabase, profile.id, workspaceId);
  if (!hasAccess) {
    return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters.page ?? 1;
  const pageSize = Math.min(
    filters.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE,
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.dateFrom) {
    query = query.gte("expense_date", filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte("expense_date", filters.dateTo);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`description.ilike.${term},vendor.ilike.${term}`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error || !data) {
    logger.error("Failed to fetch expenses", { workspaceId, reason: error?.message });
    return { data: [], total: 0, page, pageSize };
  }

  // Enrich each expense with budget info if linked
  const enriched: ExpenseWithBudget[] = [];
  for (const expense of data) {
    const withBudget = await enrichWithBudget(supabase, expense as Expense);
    enriched.push(withBudget);
  }

  return { data: enriched, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Get Single Expense
// ---------------------------------------------------------------------------

export async function getExpense(
  id: string
): Promise<ExpenseActionResponse & { expense?: ExpenseWithBudget }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: expense, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !expense) {
    return { success: false, message: "Expense not found.", error: "NOT_FOUND" };
  }

  const hasAccess = await verifyWorkspaceAccess(supabase, profile.id, expense.workspace_id);
  if (!hasAccess) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  const enriched = await enrichWithBudget(supabase, expense as Expense);

  return { success: true, message: "Expense retrieved.", expense: enriched };
}

// ---------------------------------------------------------------------------
// Approve Expense
// ---------------------------------------------------------------------------

export async function approveExpense(
  id: string
): Promise<ExpenseActionResponse & { expense?: Expense }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("expenses")
    .select("id, workspace_id, category, amount, status, description")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Expense not found.", error: "NOT_FOUND" };
  }

  if (existing.status !== "pending") {
    return { success: false, message: `Cannot approve expense in '${existing.status}' status.`, error: "INVALID_STATUS" };
  }

  const membership = await verifyWorkspaceAccess(supabase, profile.id, existing.workspace_id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const { data: expense, error } = await supabase
    .from("expenses")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !expense) {
    logger.error("Failed to approve expense", { id, reason: error?.message });
    return { success: false, message: "Failed to approve expense.", error: "UPDATE_FAILED" };
  }

  logger.info("Expense approved", { expenseId: id });
  await logActivity(
    "expense_approve" as ActivityAction,
    `Approved expense: ${existing.category} - ${existing.amount}`,
    { expenseId: id },
    existing.workspace_id
  );
  void dispatchEvent({ eventName: 'expense.approved', workspaceId: existing.workspace_id, userId: profile.id, payload: { expenseId: id }, timestamp: new Date().toISOString() }).catch(() => {});
  void createNotification(profile.id, "success", "Expense Approved", `${existing.description ?? existing.category} approved`, "/business/expenses").catch(() => {});

  return { success: true, message: "Expense approved.", expense };
}

// ---------------------------------------------------------------------------
// Reject Expense
// ---------------------------------------------------------------------------

export async function rejectExpense(
  id: string,
  reason: string
): Promise<ExpenseActionResponse & { expense?: Expense }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { success: false, message: "A rejection reason is required.", error: "INVALID_INPUT" };
  }

  const { data: existing } = await supabase
    .from("expenses")
    .select("id, workspace_id, category, amount, status, description")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Expense not found.", error: "NOT_FOUND" };
  }

  if (existing.status !== "pending") {
    return { success: false, message: `Cannot reject expense in '${existing.status}' status.`, error: "INVALID_STATUS" };
  }

  const membership = await verifyWorkspaceAccess(supabase, profile.id, existing.workspace_id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  // Append rejection reason to the description field (no separate notes column)
  const updatedDescription = existing.description
    ? `${existing.description}\n\n[Rejected] ${trimmedReason}`
    : `[Rejected] ${trimmedReason}`;

  const { data: expense, error } = await supabase
    .from("expenses")
    .update({
      status: "rejected",
      description: updatedDescription,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !expense) {
    logger.error("Failed to reject expense", { id, reason: error?.message });
    return { success: false, message: "Failed to reject expense.", error: "UPDATE_FAILED" };
  }

  logger.info("Expense rejected", { expenseId: id, reason: trimmedReason });
  await logActivity(
    "expense_reject" as ActivityAction,
    `Rejected expense: ${existing.category} - ${existing.amount}. Reason: ${trimmedReason}`,
    { expenseId: id, reason: trimmedReason },
    existing.workspace_id
  );
  void createNotification(profile.id, "warning", "Expense Rejected", `${existing.description ?? existing.category} has been rejected`, "/business/expenses").catch(() => {});

  return { success: true, message: "Expense rejected.", expense };
}

// ---------------------------------------------------------------------------
// Reimburse Expense
// ---------------------------------------------------------------------------

export async function reimburseExpense(
  id: string,
  params: { reimbursedTo: string; amount: number }
): Promise<ExpenseActionResponse & { expense?: Expense }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (!params.reimbursedTo?.trim()) {
    return { success: false, message: "reimbursedTo is required.", error: "INVALID_INPUT" };
  }

  if (typeof params.amount !== "number" || params.amount <= 0) {
    return { success: false, message: "A positive reimbursement amount is required.", error: "INVALID_INPUT" };
  }

  const { data: existing } = await supabase
    .from("expenses")
    .select("id, workspace_id, category, amount, status")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, message: "Expense not found.", error: "NOT_FOUND" };
  }

  if (existing.status !== "approved") {
    return { success: false, message: "Only approved expenses can be reimbursed.", error: "INVALID_STATUS" };
  }

  const membership = await verifyWorkspaceAccess(supabase, profile.id, existing.workspace_id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  const now = new Date().toISOString();

  const { data: expense, error } = await supabase
    .from("expenses")
    .update({
      status: "reimbursed",
      reimbursed_amount: params.amount,
      reimbursed_to: params.reimbursedTo.trim(),
      reimbursed_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !expense) {
    logger.error("Failed to reimburse expense", { id, reason: error?.message });
    return { success: false, message: "Failed to reimburse expense.", error: "UPDATE_FAILED" };
  }

  logger.info("Expense reimbursed", { expenseId: id, amount: params.amount });
  await logActivity(
    "expense_reimburse" as ActivityAction,
    `Reimbursed expense: ${existing.category} - ${params.amount} to ${params.reimbursedTo}`,
    { expenseId: id, amount: params.amount, reimbursedTo: params.reimbursedTo },
    existing.workspace_id
  );

  return { success: true, message: "Expense reimbursed.", expense };
}

// ---------------------------------------------------------------------------
// AI Categorize Expense
// ---------------------------------------------------------------------------

export async function aiCategorizeExpense(
  data: AiCategorizeRequest
): Promise<ExpenseActionResponse & { result?: AiCategorizeResult }> {
  await requireAuth();

  if (!data.description?.trim()) {
    return { success: false, message: "Description is required for AI categorization.", error: "INVALID_INPUT" };
  }

  try {
    const systemPrompt = `You are an expense categorization assistant. Given an expense description, optional vendor name, and amount, suggest the most appropriate category.

Respond with ONLY a valid JSON object (no markdown fences, no extra text) in this exact format:
{"category": "<one-word category>", "confidence": <0-1 float>, "reasoning": "<brief explanation>"}

Common expense categories include: Office Supplies, Software, Travel, Meals, Marketing, Advertising, Utilities, Rent, Insurance, Subscriptions, Equipment, Professional Services, Consulting, Legal, Accounting, Shipping, Training, Entertainment, Misc.

If you are unsure, use "Misc" with a lower confidence score.`;

    const userMessage = `Description: ${data.description}
Vendor: ${data.vendor ?? "N/A"}
Amount: ${data.amount}`;

    const response = await sendChatMessage({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      maxTokens: 200,
    });

    // Parse the JSON from the response — strip any fences if present
    let raw = response.content.trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      raw = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(raw) as AiCategorizeResult;

    // Validate the parsed structure
    if (
      typeof parsed.category !== "string" ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.reasoning !== "string"
    ) {
      return { success: false, message: "AI returned an unexpected response format.", error: "AI_PARSE_ERROR" };
    }

    // Clamp confidence to [0, 1]
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

    logger.info("Expense AI categorized", { category: parsed.category, confidence: parsed.confidence });

    return { success: true, message: "Category suggested.", result: parsed };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("AI expense categorization failed", { reason: msg });
    return { success: false, message: `AI categorization failed: ${msg}`, error: "AI_FAILED" };
  }
}

// ---------------------------------------------------------------------------
// Get Expense Stats
// ---------------------------------------------------------------------------

export async function getExpenseStats(
  workspaceId: string,
  options: { periodStart?: string; periodEnd?: string } = {}
): Promise<ExpenseActionResponse & { stats?: ExpenseDashboardStats }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const hasAccess = await verifyWorkspaceAccess(supabase, profile.id, workspaceId);
  if (!hasAccess) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Build the base query for the period
  let baseQuery = supabase
    .from("expenses")
    .select("id, category, amount, status, expense_date")
    .eq("workspace_id", workspaceId);

  if (options.periodStart) {
    baseQuery = baseQuery.gte("expense_date", options.periodStart);
  }
  if (options.periodEnd) {
    baseQuery = baseQuery.lte("expense_date", options.periodEnd);
  }

  const { data: rows, error } = await baseQuery;

  if (error || !rows) {
    logger.error("Failed to fetch expense stats", { workspaceId, reason: error?.message });
    return { success: false, message: "Failed to compute expense stats.", error: "QUERY_FAILED" };
  }

  // Compute current month boundaries if no period specified
  let periodStart: string;
  let periodEnd: string;

  if (!options.periodStart && !options.periodEnd) {
    const now = new Date();
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  } else {
    periodStart = options.periodStart ?? "";
    periodEnd = options.periodEnd ?? "";
  }

  // Filter rows by the effective period
  const filtered = rows.filter((r) => {
    if (periodStart && r.expense_date < periodStart) return false;
    if (periodEnd && r.expense_date > periodEnd) return false;
    return true;
  });

  const totalThisMonth = filtered.reduce((sum, r) => sum + r.amount, 0);

  // Breakdown by category
  const categoryMap = new Map<string, number>();
  for (const row of filtered) {
    categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + row.amount);
  }
  const byCategory = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Pending expenses across the whole workspace (not limited to period)
  const pendingRows = rows.filter((r) => r.status === "pending");
  const pendingCount = pendingRows.length;
  const pendingAmount = pendingRows.reduce((sum, r) => sum + r.amount, 0);

  const stats: ExpenseDashboardStats = {
    totalThisMonth,
    byCategory,
    pendingCount,
    pendingAmount,
  };

  return { success: true, message: "Stats computed.", stats };
}

// ---------------------------------------------------------------------------
// Get Expense Categories
// ---------------------------------------------------------------------------

export async function getExpenseCategories(
  workspaceId: string
): Promise<ExpenseActionResponse & { categories?: string[] }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const hasAccess = await verifyWorkspaceAccess(supabase, profile.id, workspaceId);
  if (!hasAccess) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }

  // Query distinct categories ordered alphabetically
  const { data, error } = await supabase
    .from("expenses")
    .select("category")
    .eq("workspace_id", workspaceId);

  if (error || !data) {
    logger.error("Failed to fetch expense categories", { workspaceId, reason: error?.message });
    return { success: false, message: "Failed to fetch categories.", error: "QUERY_FAILED" };
  }

  // Deduplicate and sort
  const categories = Array.from(new Set(data.map((r) => r.category))) as string[];

  return { success: true, message: "Categories retrieved.", categories };
}
