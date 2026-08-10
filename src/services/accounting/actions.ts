"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logActivity } from "@/services/activity-log/actions";
import { logger } from "@/services/logger";
import { verifyWorkspaceMembership, requireMinimumRole } from "@/lib/workspace-utils";
import { PAGINATION } from "@/config/constants";
import type {
  Account,
  Transaction,
  JournalEntry,
  JournalEntryLine,
  Budget,
  AccountType,
  BudgetStatus,
  InsertTables,
  Json,
  ActivityAction,
} from "@/types/generated/database";
import type {
  AccountingActionResponse,
  PaginatedResponse,
  CreateAccountRequest,
  CreateTransactionRequest,
  CreateJournalEntryRequest,
  CreateBudgetRequest,
  TransactionListFilters,
  AccountListFilters,
  BudgetListFilters,
  JournalEntryListFilters,
  ProfitLossReport,
  ProfitLossLine,
  BalanceSheetReport,
  BalanceSheetLine,
  CashFlowReport,
  CashFlowLine,
  FinancialDashboard,
  TopExpenseCategory,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------




/** Generate a random UUID-like string for IDs if needed. */
function generateId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Chart of Accounts — CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new account in the chart of accounts.
 */
export async function createAccount(
  data: CreateAccountRequest
): Promise<AccountingActionResponse & { account?: Account }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (!data.workspaceId || !data.name || !data.code || !data.accountType) {
      return { success: false, message: "workspaceId, name, code, and accountType are required.", error: "INVALID_INPUT" };
    }

    try { await requireMinimumRole(data.workspaceId, profile.id, "member"); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    // Check for duplicate code within the workspace
    const { data: existing } = await supabase
      .from("accounts")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("code", data.code)
      .single();

    if (existing) {
      return { success: false, message: "An account with this code already exists.", error: "DUPLICATE_CODE" };
    }

    const insertPayload: InsertTables<"accounts"> = {
      id: generateId(),
      workspace_id: data.workspaceId,
      name: data.name.trim(),
      code: data.code.trim(),
      account_type: data.accountType,
      is_active: true,
      balance: 0,
      currency: data.currency ?? "USD",
      description: data.description?.trim() ?? "",
      parent_id: data.parentId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: account, error } = await supabase
      .from("accounts")
      .insert(insertPayload)
      .select()
      .single();

    if (error || !account) {
      logger.error("Failed to create account", { reason: error?.message });
      return { success: false, message: "Failed to create account.", error: "CREATE_FAILED" };
    }

    logger.info("Account created", { accountId: account.id, code: account.code });
    await logActivity("account_create" as ActivityAction, `Created account: ${account.name} (${account.code})`, { code: account.code, type: account.account_type }, data.workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Account created.", account };
  } catch (err) {
    logger.error("createAccount error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Update an existing account.
 */
export async function updateAccount(
  workspaceId: string,
  accountId: string,
  updates: Partial<Pick<CreateAccountRequest, "name" | "description" | "currency" | "parentId" | "accountType">> & { isActive?: boolean }
): Promise<AccountingActionResponse & { account?: Account }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (!trimmed) {
        return { success: false, message: "Account name cannot be empty.", error: "INVALID_INPUT" };
      }
      dbUpdates.name = trimmed;
    }
    if (updates.description !== undefined) {
      dbUpdates.description = updates.description.trim();
    }
    if (updates.currency !== undefined) {
      dbUpdates.currency = updates.currency;
    }
    if (updates.parentId !== undefined) {
      dbUpdates.parent_id = updates.parentId;
    }
    if (updates.accountType !== undefined) {
      dbUpdates.account_type = updates.accountType;
    }
    if (updates.isActive !== undefined) {
      dbUpdates.is_active = updates.isActive;
    }

    const { data: account, error } = await supabase
      .from("accounts")
      .update(dbUpdates)
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error || !account) {
      logger.error("Failed to update account", { accountId, reason: error?.message });
      return { success: false, message: "Failed to update account.", error: "UPDATE_FAILED" };
    }

    logger.info("Account updated", { accountId });
    await logActivity("account_update" as ActivityAction, `Updated account: ${account.name}`, {}, workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Account updated.", account };
  } catch (err) {
    logger.error("updateAccount error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Delete an account — only if no transactions reference it.
 */
export async function deleteAccount(
  workspaceId: string,
  accountId: string
): Promise<AccountingActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await requireMinimumRole(workspaceId, profile.id, "admin"); } catch {
      return { success: false, message: "Only admins and owners can delete accounts.", error: "FORBIDDEN" };
    }

    // Check for linked transactions
    const { count: txCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("workspace_id", workspaceId);

    if (txCount && txCount > 0) {
      return { success: false, message: "Cannot delete account with existing transactions.", error: "HAS_TRANSACTIONS" };
    }

    // Check for linked journal entry lines
    const { count: jeCount } = await supabase
      .from("journal_entry_lines")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);

    if (jeCount && jeCount > 0) {
      return { success: false, message: "Cannot delete account referenced in journal entries.", error: "HAS_JOURNAL_ENTRIES" };
    }

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId)
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to delete account", { accountId, reason: error.message });
      return { success: false, message: "Failed to delete account.", error: "DELETE_FAILED" };
    }

    logger.info("Account deleted", { accountId });
    await logActivity("account_delete" as ActivityAction, `Deleted account: ${accountId}`, {}, workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Account deleted." };
  } catch (err) {
    logger.error("deleteAccount error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Get accounts for a workspace with optional filters.
 */
export async function getAccounts(
  workspaceId: string,
  filters?: AccountListFilters
): Promise<PaginatedResponse<Account>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const hasAccess = await verifyWorkspaceMembership(workspaceId, profile.id).catch(() => null);
    if (!hasAccess) {
      return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
    }

    let query = supabase
      .from("accounts")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("code", { ascending: true });

    if (filters?.accountType) {
      query = query.eq("account_type", filters.accountType);
    }
    if (filters?.activeOnly) {
      query = query.eq("is_active", true);
    }

    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await query.range(from, to);

    if (error) {
      logger.error("Failed to fetch accounts", { reason: error.message });
      return { data: [], total: 0, page, pageSize };
    }

    return { data: data ?? [], total: count ?? 0, page, pageSize };
  } catch (err) {
    logger.error("getAccounts error", { err });
    return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }
}

/**
 * Get a single account by ID.
 */
export async function getAccount(
  workspaceId: string,
  accountId: string
): Promise<AccountingActionResponse & { account?: Account }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    const { data: account, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !account) {
      return { success: false, message: "Account not found.", error: "NOT_FOUND" };
    }

    return { success: true, message: "Account retrieved.", account };
  } catch (err) {
    logger.error("getAccount error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Seed default chart of accounts for a workspace (~15 standard accounts).
 * Uses upsert pattern — checks if code exists first, skips if so.
 */
export async function seedDefaultAccounts(
  workspaceId: string
): Promise<AccountingActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await requireMinimumRole(workspaceId, profile.id, "admin"); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    const defaultAccounts: {
      code: string;
      name: string;
      accountType: AccountType;
      description: string;
    }[] = [
      // Assets
      { code: "1000", name: "Cash", accountType: "asset", description: "Cash and cash equivalents" },
      { code: "1100", name: "Accounts Receivable", accountType: "asset", description: "Money owed by customers" },
      { code: "1200", name: "Inventory", accountType: "asset", description: "Value of goods held for sale" },
      // Liabilities
      { code: "2000", name: "Accounts Payable", accountType: "liability", description: "Money owed to vendors" },
      { code: "2100", name: "Credit Card", accountType: "liability", description: "Credit card liability" },
      // Equity
      { code: "3000", name: "Owner's Equity", accountType: "equity", description: "Owner's invested capital" },
      { code: "3100", name: "Retained Earnings", accountType: "equity", description: "Accumulated retained earnings" },
      // Revenue
      { code: "4000", name: "Sales Revenue", accountType: "income", description: "Revenue from product sales" },
      { code: "4100", name: "Service Revenue", accountType: "income", description: "Revenue from services provided" },
      // Cost of Goods Sold
      { code: "5000", name: "COGS", accountType: "expense", description: "Cost of goods sold" },
      // Operating Expenses
      { code: "5100", name: "Rent", accountType: "expense", description: "Office and facility rent" },
      { code: "5200", name: "Utilities", accountType: "expense", description: "Utility expenses" },
      { code: "5300", name: "Salaries", accountType: "expense", description: "Employee salaries and wages" },
      { code: "5400", name: "Marketing", accountType: "expense", description: "Marketing and advertising expenses" },
      { code: "5500", name: "Office Supplies", accountType: "expense", description: "Office supplies and consumables" },
    ];

    // Fetch existing codes for the workspace
    const { data: existing } = await supabase
      .from("accounts")
      .select("code")
      .eq("workspace_id", workspaceId);

    const existingCodes = new Set((existing ?? []).map((a) => a.code));

    const now = new Date().toISOString();
    const toInsert: InsertTables<"accounts">[] = [];

    for (const acct of defaultAccounts) {
      if (existingCodes.has(acct.code)) continue;

      toInsert.push({
        id: generateId(),
        workspace_id: workspaceId,
        name: acct.name,
        code: acct.code,
        account_type: acct.accountType,
        is_active: true,
        balance: 0,
        currency: "USD",
        description: acct.description,
        parent_id: null,
        created_at: now,
        updated_at: now,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("accounts").insert(toInsert);

      if (error) {
        logger.error("Failed to seed default accounts", { reason: error.message });
        return { success: false, message: "Failed to seed default accounts.", error: "SEED_FAILED" };
      }
    }

    logger.info("Default accounts seeded", { workspaceId, count: toInsert.length });
    await logActivity("account_seed" as ActivityAction, `Seeded ${toInsert.length} default chart-of-accounts`, { count: toInsert.length }, workspaceId);
    return { success: true, message: `Seeded ${toInsert.length} default accounts.` };
  } catch (err) {
    logger.error("seedDefaultAccounts error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * Create a new transaction and update the account balance.
 * + for income, - for expense.
 */
export async function createTransaction(
  data: CreateTransactionRequest
): Promise<AccountingActionResponse & { transaction?: Transaction }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (!data.workspaceId || !data.accountId || typeof data.amount !== "number" || data.amount <= 0 || !data.transactionType) {
      return { success: false, message: "workspaceId, accountId, a positive amount, and transactionType are required.", error: "INVALID_INPUT" };
    }

    try { await requireMinimumRole(data.workspaceId, profile.id, "member"); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    // Verify the target account belongs to the workspace
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", data.accountId)
      .eq("workspace_id", data.workspaceId)
      .single();

    if (!account) {
      return { success: false, message: "Account not found in this workspace.", error: "NOT_FOUND" };
    }

    // If there is an opposite account, verify it also belongs to the workspace
    if (data.oppositeAccountId) {
      const { data: oppositeAccount } = await supabase
        .from("accounts")
        .select("id")
        .eq("id", data.oppositeAccountId)
        .eq("workspace_id", data.workspaceId)
        .single();

      if (!oppositeAccount) {
        return { success: false, message: "Opposite account not found in this workspace.", error: "NOT_FOUND" };
      }
    }

    const now = new Date().toISOString();
    const insertPayload: InsertTables<"transactions"> = {
      id: generateId(),
      workspace_id: data.workspaceId,
      account_id: data.accountId,
      amount: data.amount,
      currency: data.currency ?? "USD",
      transaction_type: data.transactionType,
      description: data.description?.trim() ?? "",
      reference_type: data.referenceType ?? "",
      tags: data.tags ?? [],
      metadata: (data.metadata ?? {}) as Json,
      created_by: profile.id,
      created_at: now,
      updated_at: now,
      opposite_account_id: data.oppositeAccountId ?? null,
      reference_id: data.referenceId ?? null,
      transaction_date: data.transactionDate ?? now,
    };

    const { data: transaction, error } = await supabase
      .from("transactions")
      .insert(insertPayload)
      .select()
      .single();

    if (error || !transaction) {
      logger.error("Failed to create transaction", { reason: error?.message });
      return { success: false, message: "Failed to create transaction.", error: "CREATE_FAILED" };
    }

    // Update account balance: + for income, - for expense
    const balanceAdjustment = data.transactionType === "income" ? data.amount : -data.amount;

    // Fetch current balance
    const { data: currentAccount } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", data.accountId)
      .single();

    const currentBalance = currentAccount?.balance ?? 0;
    const newBalance = currentBalance + balanceAdjustment;

    await supabase
      .from("accounts")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", data.accountId);

    // If there's an opposite account (transfer), update its balance inversely
    if (data.oppositeAccountId && data.transactionType === "transfer") {
      const { data: oppositeAccountCurrent } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", data.oppositeAccountId)
        .single();

      const oppositeCurrentBalance = oppositeAccountCurrent?.balance ?? 0;

      await supabase
        .from("accounts")
        .update({ balance: oppositeCurrentBalance + data.amount, updated_at: now })
        .eq("id", data.oppositeAccountId);
    }

    logger.info("Transaction created", { transactionId: transaction.id, amount: data.amount, type: data.transactionType });
    await logActivity(
      "transaction_create" as ActivityAction,
      `Created ${data.transactionType} transaction: ${data.amount}`,
      { amount: data.amount, type: data.transactionType, account: data.accountId },
      data.workspaceId
    );
    revalidatePath("/business");
    return { success: true, message: "Transaction created.", transaction };
  } catch (err) {
    logger.error("createTransaction error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Get paginated transactions for a workspace with optional filters.
 */
export async function getTransactions(
  workspaceId: string,
  filters?: TransactionListFilters
): Promise<PaginatedResponse<Transaction>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const hasAccess = await verifyWorkspaceMembership(workspaceId, profile.id).catch(() => null);
    if (!hasAccess) {
      return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
    }

    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("transaction_date", { ascending: false });

    if (filters?.transactionType) {
      query = query.eq("transaction_type", filters.transactionType);
    }
    if (filters?.dateFrom) {
      query = query.gte("transaction_date", filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte("transaction_date", filters.dateTo);
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      logger.error("Failed to fetch transactions", { reason: error.message });
      return { data: [], total: 0, page, pageSize };
    }

    return { data: data ?? [], total: count ?? 0, page, pageSize };
  } catch (err) {
    logger.error("getTransactions error", { err });
    return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }
}

/**
 * Get a single transaction by ID.
 */
export async function getTransaction(
  workspaceId: string,
  transactionId: string
): Promise<AccountingActionResponse & { transaction?: Transaction }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    const { data: transaction, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !transaction) {
      return { success: false, message: "Transaction not found.", error: "NOT_FOUND" };
    }

    return { success: true, message: "Transaction retrieved.", transaction };
  } catch (err) {
    logger.error("getTransaction error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Delete a transaction (admin only) — reverses the account balance.
 */
export async function deleteTransaction(
  workspaceId: string,
  transactionId: string
): Promise<AccountingActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await requireMinimumRole(workspaceId, profile.id, "admin"); } catch {
      return { success: false, message: "Only admins and owners can delete transactions.", error: "FORBIDDEN" };
    }

    // Fetch the transaction to know amount and type for reversal
    const { data: transaction, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !transaction) {
      return { success: false, message: "Transaction not found.", error: "NOT_FOUND" };
    }

    // Delete the transaction
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transactionId)
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to delete transaction", { transactionId, reason: error.message });
      return { success: false, message: "Failed to delete transaction.", error: "DELETE_FAILED" };
    }

    // Reverse the account balance
    const reversalAmount = transaction.transaction_type === "income"
      ? -transaction.amount
      : transaction.transaction_type === "expense"
        ? transaction.amount
        : 0;

    if (reversalAmount !== 0) {
      const { data: currentAccount } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", transaction.account_id)
        .single();

      const currentBalance = currentAccount?.balance ?? 0;
      const now = new Date().toISOString();

      await supabase
        .from("accounts")
        .update({ balance: currentBalance + reversalAmount, updated_at: now })
        .eq("id", transaction.account_id);

      // If there was an opposite account in a transfer, reverse that too
      if (transaction.opposite_account_id && transaction.transaction_type === "transfer") {
        const { data: oppositeCurrent } = await supabase
          .from("accounts")
          .select("balance")
          .eq("id", transaction.opposite_account_id)
          .single();

        const oppositeBalance = oppositeCurrent?.balance ?? 0;

        await supabase
          .from("accounts")
          .update({ balance: oppositeBalance - transaction.amount, updated_at: now })
          .eq("id", transaction.opposite_account_id);
      }
    }

    logger.info("Transaction deleted", { transactionId });
    await logActivity("transaction_delete" as ActivityAction, `Deleted transaction: ${transactionId}`, { amount: transaction.amount, type: transaction.transaction_type }, workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Transaction deleted." };
  } catch (err) {
    logger.error("deleteTransaction error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

// ---------------------------------------------------------------------------
// Journal Entries
// ---------------------------------------------------------------------------

/**
 * Create a journal entry with lines.
 * Validates that sum(debits) = sum(credits).
 */
export async function createJournalEntry(
  data: CreateJournalEntryRequest
): Promise<AccountingActionResponse & { journalEntry?: JournalEntry; lines?: JournalEntryLine[] }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (!data.workspaceId || !data.description || !data.lines || data.lines.length < 2) {
      return { success: false, message: "workspaceId, description, and at least 2 lines are required.", error: "INVALID_INPUT" };
    }

    try { await requireMinimumRole(data.workspaceId, profile.id, "member"); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    // Validate debit/credit balance
    const totalDebits = data.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
    const totalCredits = data.lines.reduce((sum, line) => sum + (line.credit || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.001) {
      return {
        success: false,
        message: `Journal entry must be balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`,
        error: "UNBALANCED_ENTRY",
      };
    }

    // Verify all accounts exist and belong to the workspace
    const accountIds = [...new Set(data.lines.map((l) => l.accountId))];
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .in("id", accountIds);

    if (!accounts || accounts.length !== accountIds.length) {
      return { success: false, message: "One or more accounts not found in this workspace.", error: "NOT_FOUND" };
    }

    const now = new Date().toISOString();
    const entryId = generateId();

    // Insert the journal entry header
    const entryPayload: InsertTables<"journal_entries"> = {
      id: entryId,
      workspace_id: data.workspaceId,
      description: data.description.trim(),
      entry_date: data.entryDate ?? now,
      status: "draft",
      created_by: profile.id,
      created_at: now,
      updated_at: now,
    };

    const { data: entry, error: entryError } = await supabase
      .from("journal_entries")
      .insert(entryPayload)
      .select()
      .single();

    if (entryError || !entry) {
      logger.error("Failed to create journal entry", { reason: entryError?.message });
      return { success: false, message: "Failed to create journal entry.", error: "CREATE_FAILED" };
    }

    // Insert lines
    const linePayloads: InsertTables<"journal_entry_lines">[] = data.lines.map((line) => ({
      id: generateId(),
      journal_entry_id: entryId,
      account_id: line.accountId,
      debit: line.debit || 0,
      credit: line.credit || 0,
      description: line.description?.trim() ?? "",
      created_at: now,
    }));

    const { data: lines, error: linesError } = await supabase
      .from("journal_entry_lines")
      .insert(linePayloads)
      .select();

    if (linesError) {
      logger.error("Failed to create journal entry lines", { reason: linesError.message });
      // Attempt to clean up the entry header
      await supabase.from("journal_entries").delete().eq("id", entryId);
      return { success: false, message: "Failed to create journal entry lines.", error: "CREATE_FAILED" };
    }

    logger.info("Journal entry created", { entryId, lineCount: lines?.length });
    await logActivity("journal_entry_create" as ActivityAction, `Created journal entry: ${data.description.trim()}`, { lineCount: data.lines.length, totalDebits, totalCredits }, data.workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Journal entry created.", journalEntry: entry, lines: lines ?? [] };
  } catch (err) {
    logger.error("createJournalEntry error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Get paginated journal entries for a workspace.
 */
export async function getJournalEntries(
  workspaceId: string,
  filters?: JournalEntryListFilters
): Promise<PaginatedResponse<JournalEntry>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const hasAccess = await verifyWorkspaceMembership(workspaceId, profile.id).catch(() => null);
    if (!hasAccess) {
      return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
    }

    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from("journal_entries")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("entry_date", { ascending: false })
      .range(from, to);

    if (error) {
      logger.error("Failed to fetch journal entries", { reason: error.message });
      return { data: [], total: 0, page, pageSize };
    }

    return { data: data ?? [], total: count ?? 0, page, pageSize };
  } catch (err) {
    logger.error("getJournalEntries error", { err });
    return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }
}

/**
 * Get a single journal entry with its lines.
 */
export async function getJournalEntry(
  workspaceId: string,
  entryId: string
): Promise<AccountingActionResponse & { journalEntry?: JournalEntry; lines?: JournalEntryLine[] }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    const { data: entry, error } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("id", entryId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !entry) {
      return { success: false, message: "Journal entry not found.", error: "NOT_FOUND" };
    }

    // Fetch lines
    const { data: lines } = await supabase
      .from("journal_entry_lines")
      .select("*")
      .eq("journal_entry_id", entryId);

    return { success: true, message: "Journal entry retrieved.", journalEntry: entry, lines: lines ?? [] };
  } catch (err) {
    logger.error("getJournalEntry error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Post (finalize) a draft journal entry — updates account balances.
 */
export async function postJournalEntry(
  workspaceId: string,
  entryId: string
): Promise<AccountingActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await requireMinimumRole(workspaceId, profile.id, "admin"); } catch {
      return { success: false, message: "Only admins can post journal entries.", error: "FORBIDDEN" };
    }

    // Fetch the journal entry
    const { data: entry, error: entryError } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("id", entryId)
      .eq("workspace_id", workspaceId)
      .single();

    if (entryError || !entry) {
      return { success: false, message: "Journal entry not found.", error: "NOT_FOUND" };
    }

    if (entry.status === "posted") {
      return { success: false, message: "Journal entry is already posted.", error: "ALREADY_POSTED" };
    }

    // Fetch lines
    const { data: lines } = await supabase
      .from("journal_entry_lines")
      .select("*")
      .eq("journal_entry_id", entryId);

    if (!lines || lines.length === 0) {
      return { success: false, message: "Journal entry has no lines.", error: "NO_LINES" };
    }

    const now = new Date().toISOString();

    // Update account balances for each line
    for (const line of lines) {
      if (line.debit > 0) {
        // Fetch current balance
        const { data: currentAccount } = await supabase
          .from("accounts")
          .select("balance")
          .eq("id", line.account_id)
          .single();

        const currentBalance = currentAccount?.balance ?? 0;

        await supabase
          .from("accounts")
          .update({ balance: currentBalance + line.debit, updated_at: now })
          .eq("id", line.account_id);
      }

      if (line.credit > 0) {
        const { data: currentAccount } = await supabase
          .from("accounts")
          .select("balance")
          .eq("id", line.account_id)
          .single();

        const currentBalance = currentAccount?.balance ?? 0;

        await supabase
          .from("accounts")
          .update({ balance: currentBalance - line.credit, updated_at: now })
          .eq("id", line.account_id);
      }
    }

    // Update entry status to "posted"
    const { error: updateError } = await supabase
      .from("journal_entries")
      .update({ status: "posted", updated_at: now })
      .eq("id", entryId);

    if (updateError) {
      logger.error("Failed to post journal entry", { entryId, reason: updateError.message });
      return { success: false, message: "Failed to post journal entry.", error: "UPDATE_FAILED" };
    }

    logger.info("Journal entry posted", { entryId });
    await logActivity("journal_entry_post" as ActivityAction, `Posted journal entry: ${entry.description}`, {}, workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Journal entry posted." };
  } catch (err) {
    logger.error("postJournalEntry error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * Create a new budget.
 */
export async function createBudget(
  data: CreateBudgetRequest
): Promise<AccountingActionResponse & { budget?: Budget }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (!data.workspaceId || !data.name || !data.category || typeof data.amount !== "number" || data.amount <= 0 || !data.periodStart || !data.periodEnd) {
      return { success: false, message: "workspaceId, name, category, amount, periodStart, and periodEnd are required.", error: "INVALID_INPUT" };
    }

    try { await requireMinimumRole(data.workspaceId, profile.id, "member"); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    const now = new Date().toISOString();
    const insertPayload: InsertTables<"budgets"> = {
      id: generateId(),
      workspace_id: data.workspaceId,
      name: data.name.trim(),
      category: data.category.trim(),
      amount: data.amount,
      spent: 0,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      status: data.status ?? "draft",
      created_by: profile.id,
      created_at: now,
      updated_at: now,
    };

    const { data: budget, error } = await supabase
      .from("budgets")
      .insert(insertPayload)
      .select()
      .single();

    if (error || !budget) {
      logger.error("Failed to create budget", { reason: error?.message });
      return { success: false, message: "Failed to create budget.", error: "CREATE_FAILED" };
    }

    logger.info("Budget created", { budgetId: budget.id, name: budget.name });
    await logActivity("budget_create" as ActivityAction, `Created budget: ${budget.name}`, { category: budget.category, amount: budget.amount }, data.workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Budget created.", budget };
  } catch (err) {
    logger.error("createBudget error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Update an existing budget.
 */
export async function updateBudget(
  workspaceId: string,
  budgetId: string,
  updates: Partial<Pick<CreateBudgetRequest, "name" | "category" | "amount" | "periodStart" | "periodEnd">> & { status?: BudgetStatus }
): Promise<AccountingActionResponse & { budget?: Budget }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (!trimmed) {
        return { success: false, message: "Budget name cannot be empty.", error: "INVALID_INPUT" };
      }
      dbUpdates.name = trimmed;
    }
    if (updates.category !== undefined) {
      dbUpdates.category = updates.category.trim();
    }
    if (updates.amount !== undefined) {
      if (updates.amount <= 0) {
        return { success: false, message: "Budget amount must be positive.", error: "INVALID_INPUT" };
      }
      dbUpdates.amount = updates.amount;
    }
    if (updates.periodStart !== undefined) {
      dbUpdates.period_start = updates.periodStart;
    }
    if (updates.periodEnd !== undefined) {
      dbUpdates.period_end = updates.periodEnd;
    }
    if (updates.status !== undefined) {
      dbUpdates.status = updates.status;
    }

    const { data: budget, error } = await supabase
      .from("budgets")
      .update(dbUpdates)
      .eq("id", budgetId)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error || !budget) {
      logger.error("Failed to update budget", { budgetId, reason: error?.message });
      return { success: false, message: "Failed to update budget.", error: "UPDATE_FAILED" };
    }

    logger.info("Budget updated", { budgetId });
    await logActivity("budget_update" as ActivityAction, `Updated budget: ${budget.name}`, {}, workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Budget updated.", budget };
  } catch (err) {
    logger.error("updateBudget error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Delete a budget.
 */
export async function deleteBudget(
  workspaceId: string,
  budgetId: string
): Promise<AccountingActionResponse> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await requireMinimumRole(workspaceId, profile.id, "admin"); } catch {
      return { success: false, message: "Only admins and owners can delete budgets.", error: "FORBIDDEN" };
    }
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("id", budgetId)
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to delete budget", { budgetId, reason: error.message });
      return { success: false, message: "Failed to delete budget.", error: "DELETE_FAILED" };
    }

    logger.info("Budget deleted", { budgetId });
    await logActivity("budget_delete" as ActivityAction, `Deleted budget: ${budgetId}`, {}, workspaceId);
    revalidatePath("/business");
    return { success: true, message: "Budget deleted." };
  } catch (err) {
    logger.error("deleteBudget error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Get paginated budgets for a workspace with optional filters.
 */
export async function getBudgets(
  workspaceId: string,
  filters?: BudgetListFilters
): Promise<PaginatedResponse<Budget>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const hasAccess = await verifyWorkspaceMembership(workspaceId, profile.id).catch(() => null);
    if (!hasAccess) {
      return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
    }

    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, PAGINATION.MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("budgets")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("period_start", { ascending: false });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      logger.error("Failed to fetch budgets", { reason: error.message });
      return { data: [], total: 0, page, pageSize };
    }

    return { data: data ?? [], total: count ?? 0, page, pageSize };
  } catch (err) {
    logger.error("getBudgets error", { err });
    return { data: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }
}

/**
 * Recalculate the `spent` amount on a budget by summing actual expenses
 * that match the budget's category and fall within its period.
 */
export async function updateBudgetSpent(
  workspaceId: string,
  budgetId: string
): Promise<AccountingActionResponse & { budget?: Budget }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    // Fetch the budget to get its category and period
    const { data: budget, error: fetchError } = await supabase
      .from("budgets")
      .select("*")
      .eq("id", budgetId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !budget) {
      return { success: false, message: "Budget not found.", error: "NOT_FOUND" };
    }

    // Sum expenses for this category within the budget period
    const { data: expenseSum } = await supabase
      .from("expenses")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .eq("category", budget.category)
      .gte("expense_date", budget.period_start)
      .lte("expense_date", budget.period_end);

    const totalSpent = (expenseSum ?? []).reduce((sum, e) => sum + e.amount, 0);

    const { data: updatedBudget, error: updateError } = await supabase
      .from("budgets")
      .update({ spent: totalSpent, updated_at: new Date().toISOString() })
      .eq("id", budgetId)
      .select()
      .single();

    if (updateError || !updatedBudget) {
      logger.error("Failed to update budget spent", { budgetId, reason: updateError?.message });
      return { success: false, message: "Failed to update budget spent amount.", error: "UPDATE_FAILED" };
    }

    logger.info("Budget spent updated", { budgetId, totalSpent });
    return { success: true, message: "Budget spent amount updated.", budget: updatedBudget };
  } catch (err) {
    logger.error("updateBudgetSpent error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

// ---------------------------------------------------------------------------
// Financial Reports
// ---------------------------------------------------------------------------

/**
 * Generate a Profit & Loss report for a workspace within a date range.
 * Groups transactions by the associated account type.
 */
export async function getProfitLoss(
  workspaceId: string,
  params: { periodStart: string; periodEnd: string }
): Promise<AccountingActionResponse & { report?: ProfitLossReport }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    if (!params.periodStart || !params.periodEnd) {
      return { success: false, message: "periodStart and periodEnd are required.", error: "INVALID_INPUT" };
    }

    // Fetch all income transactions in the period with their account info
    const { data: incomeTransactions } = await supabase
      .from("transactions")
      .select("amount, accounts!inner(id, name, account_type)")
      .eq("workspace_id", workspaceId)
      .eq("transaction_type", "income")
      .gte("transaction_date", params.periodStart)
      .lte("transaction_date", params.periodEnd);

    // Group income by account name
    const revenueMap = new Map<string, number>();
    for (const tx of incomeTransactions ?? []) {
      const acct = tx.accounts as unknown as { name: string };
      const name = acct?.name ?? "Other Revenue";
      revenueMap.set(name, (revenueMap.get(name) ?? 0) + tx.amount);
    }

    const revenue: ProfitLossLine[] = [];
    let totalRevenue = 0;
    for (const [categoryName, totalAmount] of revenueMap) {
      revenue.push({ categoryName, totalAmount });
      totalRevenue += totalAmount;
    }

    // Fetch all expense transactions in the period
    const { data: expenseTransactions } = await supabase
      .from("transactions")
      .select("amount, accounts!inner(id, name, account_type)")
      .eq("workspace_id", workspaceId)
      .eq("transaction_type", "expense")
      .gte("transaction_date", params.periodStart)
      .lte("transaction_date", params.periodEnd);

    // Group expenses by account name
    const expenseMap = new Map<string, number>();
    for (const tx of expenseTransactions ?? []) {
      const acct = tx.accounts as unknown as { name: string };
      const name = acct?.name ?? "Other Expenses";
      expenseMap.set(name, (expenseMap.get(name) ?? 0) + tx.amount);
    }

    const expenses: ProfitLossLine[] = [];
    let totalExpenses = 0;
    for (const [categoryName, totalAmount] of expenseMap) {
      expenses.push({ categoryName, totalAmount });
      totalExpenses += totalAmount;
    }

    const report: ProfitLossReport = {
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      revenue,
      totalRevenue,
      expenses,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    };

    return { success: true, message: "Profit & Loss report generated.", report };
  } catch (err) {
    logger.error("getProfitLoss error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Generate a Balance Sheet report as of a specific date.
 * Queries account balances grouped by type.
 */
export async function getBalanceSheet(
  workspaceId: string,
  params: { asOfDate: string }
): Promise<AccountingActionResponse & { report?: BalanceSheetReport }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    if (!params.asOfDate) {
      return { success: false, message: "asOfDate is required.", error: "INVALID_INPUT" };
    }

    // Fetch all accounts
    const { data: accounts, error: acctError } = await supabase
      .from("accounts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    if (acctError) {
      logger.error("Failed to fetch accounts for balance sheet", { reason: acctError.message });
      return { success: false, message: "Failed to generate balance sheet.", error: "FETCH_FAILED" };
    }

    const assets: BalanceSheetLine[] = [];
    const liabilities: BalanceSheetLine[] = [];
    const equity: BalanceSheetLine[] = [];
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const account of accounts ?? []) {
      // The stored balance reflects current state; use it directly
      const balance = account.balance;

      const line: BalanceSheetLine = {
        accountName: account.name,
        accountCode: account.code,
        amount: Math.abs(balance),
      };

      if (account.account_type === "asset") {
        assets.push(line);
        totalAssets += Math.abs(balance);
      } else if (account.account_type === "liability") {
        liabilities.push(line);
        totalLiabilities += Math.abs(balance);
      } else if (account.account_type === "equity") {
        equity.push(line);
        totalEquity += Math.abs(balance);
      }
    }

    const report: BalanceSheetReport = {
      asOfDate: params.asOfDate,
      assets,
      totalAssets,
      liabilities,
      totalLiabilities,
      equity,
      totalEquity,
    };

    return { success: true, message: "Balance sheet generated.", report };
  } catch (err) {
    logger.error("getBalanceSheet error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Generate a Cash Flow report for a workspace within a date range.
 * Categorizes transactions into operating, investing, and financing activities.
 */
export async function getCashFlow(
  workspaceId: string,
  params: { periodStart: string; periodEnd: string }
): Promise<AccountingActionResponse & { report?: CashFlowReport }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    if (!params.periodStart || !params.periodEnd) {
      return { success: false, message: "periodStart and periodEnd are required.", error: "INVALID_INPUT" };
    }

    // Fetch all transactions in the period with their account info
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*, accounts!inner(id, name, code, account_type)")
      .eq("workspace_id", workspaceId)
      .gte("transaction_date", params.periodStart)
      .lte("transaction_date", params.periodEnd);

    const operatingActivities: CashFlowLine[] = [];
    const investingActivities: CashFlowLine[] = [];
    const financingActivities: CashFlowLine[] = [];

    // Operating: income/expense from revenue and expense accounts
    // Investing: transactions from asset accounts (non-cash)
    // Financing: transactions from liability and equity accounts
    const operatingMap = new Map<string, number>();
    const investingMap = new Map<string, number>();
    const financingMap = new Map<string, number>();

    for (const tx of transactions ?? []) {
      const acct = tx.accounts as unknown as { name: string; code: string; account_type: AccountType };
      const acctType = acct?.account_type;
      const acctCode = acct?.code ?? "";
      const name = acct?.name ?? "Unknown";

      if (acctType === "income" || acctType === "expense") {
        const amount = tx.transaction_type === "income" ? tx.amount : -tx.amount;
        operatingMap.set(name, (operatingMap.get(name) ?? 0) + amount);
      } else if (acctType === "asset" && acctCode !== "1000") {
        // Non-cash assets = investing
        const amount = tx.transaction_type === "expense" ? tx.amount : -tx.amount;
        investingMap.set(name, (investingMap.get(name) ?? 0) + amount);
      } else if (acctType === "liability" || acctType === "equity") {
        const amount = tx.transaction_type === "income" ? tx.amount : -tx.amount;
        financingMap.set(name, (financingMap.get(name) ?? 0) + amount);
      }
    }

    let totalOperating = 0;
    for (const [description, amount] of operatingMap) {
      operatingActivities.push({ description, amount });
      totalOperating += amount;
    }

    let totalInvesting = 0;
    for (const [description, amount] of investingMap) {
      investingActivities.push({ description, amount });
      totalInvesting += amount;
    }

    let totalFinancing = 0;
    for (const [description, amount] of financingMap) {
      financingActivities.push({ description, amount });
      totalFinancing += amount;
    }

    const report: CashFlowReport = {
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      operatingActivities,
      totalOperating,
      investingActivities,
      totalInvesting,
      financingActivities,
      totalFinancing,
      netCashFlow: totalOperating + totalInvesting + totalFinancing,
    };

    return { success: true, message: "Cash flow report generated.", report };
  } catch (err) {
    logger.error("getCashFlow error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}

/**
 * Generate an aggregated financial dashboard for a workspace.
 * Computes: totalIncome, totalExpenses, netProfit, cashBalance,
 * accountsReceivable, accountsPayable, topExpenseCategories.
 */
export async function getFinancialDashboard(
  workspaceId: string
): Promise<AccountingActionResponse & { dashboard?: FinancialDashboard }> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    try { await verifyWorkspaceMembership(workspaceId, profile.id); } catch {
      return { success: false, message: "Workspace not found or access denied.", error: "FORBIDDEN" };
    }

    // --- Total income ---
    const { data: incomeRows } = await supabase
      .from("transactions")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .eq("transaction_type", "income");

    const totalIncome = (incomeRows ?? []).reduce((sum, r) => sum + r.amount, 0);

    // --- Total expenses ---
    const { data: expenseRows } = await supabase
      .from("transactions")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .eq("transaction_type", "expense");

    const totalExpenses = (expenseRows ?? []).reduce((sum, r) => sum + r.amount, 0);

    // --- Cash balance (account code "1000") ---
    const { data: cashAccount } = await supabase
      .from("accounts")
      .select("balance")
      .eq("workspace_id", workspaceId)
      .eq("code", "1000")
      .eq("is_active", true)
      .single();

    const cashBalance = cashAccount?.balance ?? 0;

    // --- Accounts receivable (account code "1100") ---
    const { data: arAccount } = await supabase
      .from("accounts")
      .select("balance")
      .eq("workspace_id", workspaceId)
      .eq("code", "1100")
      .eq("is_active", true)
      .single();

    const accountsReceivable = arAccount?.balance ?? 0;

    // --- Accounts payable (account code "2000") ---
    const { data: apAccount } = await supabase
      .from("accounts")
      .select("balance")
      .eq("workspace_id", workspaceId)
      .eq("code", "2000")
      .eq("is_active", true)
      .single();

    const accountsPayable = apAccount?.balance ?? 0;

    // --- Top expense categories ---
    const { data: expenseTransactions } = await supabase
      .from("transactions")
      .select("amount, accounts!inner(id, name, account_type)")
      .eq("workspace_id", workspaceId)
      .eq("transaction_type", "expense");

    const categoryMap = new Map<string, number>();
    for (const tx of expenseTransactions ?? []) {
      const acct = tx.accounts as unknown as { name: string };
      const name = acct?.name ?? "Other";
      categoryMap.set(name, (categoryMap.get(name) ?? 0) + tx.amount);
    }

    const topExpenseCategories: TopExpenseCategory[] = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    const dashboard: FinancialDashboard = {
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      cashBalance,
      accountsReceivable,
      accountsPayable,
      topExpenseCategories,
    };

    return { success: true, message: "Financial dashboard data retrieved.", dashboard };
  } catch (err) {
    logger.error("getFinancialDashboard error", { err });
    return { success: false, message: "An unexpected error occurred.", error: "INTERNAL_ERROR" };
  }
}
