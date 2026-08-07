/**
 * Supa AI — Phase 10 accounting service (server-only).
 *
 * Owns the `transactions` table (the cash ledger — money in / out /
 * transfers) and the `accounting_entries` table (double-entry journal
 * rows). Also exposes `balanceSheet` + `profitAndLoss` aggregate
 * reports used by the accounting UI.
 *
 * @module @/lib/business/accounting-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  AccountingEntry,
  Company,
  CreateAccountingEntryInput,
  CreateCompanyInput,
  CreateTransactionInput,
  Transaction,
  UpdateAccountingEntryInput,
  UpdateCompanyInput,
  UpdateTransactionInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 200;

// ---------------------------------------------------------------------------
// TransactionService
// ---------------------------------------------------------------------------

export class TransactionService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      type?: string;
      status?: string;
      category?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Transaction[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("transactions")
        .select()
        .eq("workspace_id", workspaceId)
        .order("date", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.type) query = query.eq("type", opts.type);
      if (opts.status) query = query.eq("status", opts.status);
      if (opts.category) query = query.eq("category", opts.category);
      if (opts.dateFrom) query = query.gte("date", opts.dateFrom);
      if (opts.dateTo) query = query.lte("date", opts.dateTo);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `description.ilike.%${term}%,category.ilike.%${term}%,account.ilike.%${term}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "transactions.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing transactions.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    transactionId: string,
  ): Promise<Transaction> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("transactions")
        .select()
        .eq("id", transactionId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "transactions.get failed");
      if (!data) throw new NotFoundError("Transaction", transactionId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching transaction.", {
        transactionId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateTransactionInput,
  ): Promise<Transaction> {
    if (!input.type) throw new ValidationError("Transaction type is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("transactions")
        .insert({
          workspace_id: workspaceId,
          type: input.type,
          category: input.category ?? "general",
          amount: input.amount ?? 0,
          currency: input.currency ?? "USD",
          date: input.date ?? new Date().toISOString().slice(0, 10),
          description: input.description ?? null,
          reference_id: input.referenceId ?? null,
          reference_type: input.referenceType ?? null,
          account: input.account ?? null,
          status: input.status ?? "pending",
          metadata: (input.metadata ?? null) as never,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "transactions.create failed");
      if (!data) throw new NotFoundError("Transaction create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating transaction.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ): Promise<Transaction> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.type !== undefined) patch.type = input.type;
    if (input.category !== undefined) patch.category = input.category;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.date !== undefined) patch.date = input.date;
    if (input.description !== undefined) patch.description = input.description;
    if (input.referenceId !== undefined) patch.reference_id = input.referenceId;
    if (input.referenceType !== undefined) patch.reference_type = input.referenceType;
    if (input.account !== undefined) patch.account = input.account;
    if (input.status !== undefined) patch.status = input.status;
    if (input.metadata !== undefined) patch.metadata = input.metadata as never;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("transactions")
        .update(patch as never)
        .eq("id", transactionId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "transactions.update failed");
      if (!data) throw new NotFoundError("Transaction", transactionId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating transaction.", {
        transactionId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    transactionId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("transactions")
        .delete()
        .eq("id", transactionId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "transactions.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting transaction.", {
        transactionId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// AccountingService (double-entry ledger)
// ---------------------------------------------------------------------------

export class AccountingService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async listEntries(
    workspaceId: string,
    userId: string,
    opts: {
      dateFrom?: string;
      dateTo?: string;
      account?: string;
      referenceId?: string;
      referenceType?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<AccountingEntry[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("accounting_entries")
        .select()
        .eq("workspace_id", workspaceId)
        .order("date", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.dateFrom) query = query.gte("date", opts.dateFrom);
      if (opts.dateTo) query = query.lte("date", opts.dateTo);
      if (opts.account) {
        query = query.or(
          `debit_account.eq.${opts.account},credit_account.eq.${opts.account}`,
        );
      }
      if (opts.referenceId) query = query.eq("reference_id", opts.referenceId);
      if (opts.referenceType) query = query.eq("reference_type", opts.referenceType);

      const { data, error } = await query;
      if (error) throw toDbError(error, "accounting_entries.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing accounting entries.", {
        workspaceId,
      });
    }
  }

  async getEntry(
    workspaceId: string,
    userId: string,
    entryId: string,
  ): Promise<AccountingEntry> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("accounting_entries")
        .select()
        .eq("id", entryId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "accounting_entries.get failed");
      if (!data) throw new NotFoundError("AccountingEntry", entryId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching accounting entry.", {
        entryId,
      });
    }
  }

  async createEntry(
    workspaceId: string,
    userId: string,
    input: CreateAccountingEntryInput,
  ): Promise<AccountingEntry> {
    if (!input.debitAccount || !input.creditAccount) {
      throw new ValidationError("Both debit and credit accounts are required.");
    }
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("accounting_entries")
        .insert({
          workspace_id: workspaceId,
          date: input.date ?? new Date().toISOString().slice(0, 10),
          description: input.description ?? null,
          debit_account: input.debitAccount,
          credit_account: input.creditAccount,
          amount: input.amount ?? 0,
          currency: input.currency ?? "USD",
          reference_id: input.referenceId ?? null,
          reference_type: input.referenceType ?? null,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "accounting_entries.create failed");
      if (!data) throw new NotFoundError("AccountingEntry create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating accounting entry.", {
        workspaceId,
      });
    }
  }

  async updateEntry(
    workspaceId: string,
    userId: string,
    entryId: string,
    input: UpdateAccountingEntryInput,
  ): Promise<AccountingEntry> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.date !== undefined) patch.date = input.date;
    if (input.description !== undefined) patch.description = input.description;
    if (input.debitAccount !== undefined) patch.debit_account = input.debitAccount;
    if (input.creditAccount !== undefined) patch.credit_account = input.creditAccount;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.referenceId !== undefined) patch.reference_id = input.referenceId;
    if (input.referenceType !== undefined) patch.reference_type = input.referenceType;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("accounting_entries")
        .update(patch as never)
        .eq("id", entryId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "accounting_entries.update failed");
      if (!data) throw new NotFoundError("AccountingEntry", entryId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating accounting entry.", {
        entryId,
      });
    }
  }

  async deleteEntry(
    workspaceId: string,
    userId: string,
    entryId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("accounting_entries")
        .delete()
        .eq("id", entryId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "accounting_entries.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting accounting entry.", {
        entryId,
      });
    }
  }

  /**
   * Compute a simple balance sheet — total debits vs total credits per
   * account for a date range. Returns the per-account balances plus the
   * grand total debits + credits (which should always match for a
   * properly balanced ledger).
   */
  async balanceSheet(
    workspaceId: string,
    userId: string,
    opts: { dateTo?: string } = {},
  ): Promise<{
    accounts: Array<{ account: string; debit: number; credit: number; balance: number }>;
    totalDebit: number;
    totalCredit: number;
  }> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("accounting_entries")
        .select("debit_account, credit_account, amount")
        .eq("workspace_id", workspaceId);
      if (opts.dateTo) query = query.lte("date", opts.dateTo);

      const { data, error } = await query;
      if (error) throw toDbError(error, "balanceSheet failed");

      const map = new Map<string, { debit: number; credit: number }>();
      let totalDebit = 0;
      let totalCredit = 0;
      for (const row of data ?? []) {
        const amt = Number(row.amount ?? 0);
        const debitAccount = String(row.debit_account ?? "");
        const creditAccount = String(row.credit_account ?? "");
        const d = map.get(debitAccount) ?? { debit: 0, credit: 0 };
        d.debit += amt;
        map.set(debitAccount, d);
        const c = map.get(creditAccount) ?? { debit: 0, credit: 0 };
        c.credit += amt;
        map.set(creditAccount, c);
        totalDebit += amt;
        totalCredit += amt;
      }

      const accounts = Array.from(map.entries())
        .map(([account, v]) => ({
          account,
          debit: v.debit,
          credit: v.credit,
          balance: v.debit - v.credit,
        }))
        .sort((a, b) => a.account.localeCompare(b.account));

      return { accounts, totalDebit, totalCredit };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure computing balance sheet.", {
        workspaceId,
      });
    }
  }

  /**
   * Compute a simple profit-and-loss summary — total income (credits to
   * revenue-like accounts) vs total expenses (debits to expense-like
   * accounts) for a date range.
   */
  async profitAndLoss(
    workspaceId: string,
    userId: string,
    opts: { dateFrom?: string; dateTo?: string } = {},
  ): Promise<{
    income: number;
    expenses: number;
    net: number;
    byAccount: Array<{ account: string; income: number; expense: number }>;
  }> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("accounting_entries")
        .select("debit_account, credit_account, amount")
        .eq("workspace_id", workspaceId);
      if (opts.dateFrom) query = query.gte("date", opts.dateFrom);
      if (opts.dateTo) query = query.lte("date", opts.dateTo);

      const { data, error } = await query;
      if (error) throw toDbError(error, "profitAndLoss failed");

      const isRevenueAccount = (acct: string) =>
        /^(revenue|sales|income|other-income)/i.test(acct);
      const isExpenseAccount = (acct: string) =>
        /^(expense|cost|cogs|admin|salary|rent|utility|marketing|advertising|tax)/i.test(acct);

      const map = new Map<string, { income: number; expense: number }>();
      let income = 0;
      let expenses = 0;
      for (const row of data ?? []) {
        const amt = Number(row.amount ?? 0);
        const debitAccount = String(row.debit_account ?? "");
        const creditAccount = String(row.credit_account ?? "");
        if (isRevenueAccount(creditAccount)) {
          income += amt;
          const v = map.get(creditAccount) ?? { income: 0, expense: 0 };
          v.income += amt;
          map.set(creditAccount, v);
        }
        if (isExpenseAccount(debitAccount)) {
          expenses += amt;
          const v = map.get(debitAccount) ?? { income: 0, expense: 0 };
          v.expense += amt;
          map.set(debitAccount, v);
        }
      }

      const byAccount = Array.from(map.entries())
        .map(([account, v]) => ({ account, ...v }))
        .sort((a, b) => a.account.localeCompare(b.account));

      return { income, expenses, net: income - expenses, byAccount };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure computing P&L.", {
        workspaceId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// CompanyService (the workspace's own company profile)
// ---------------------------------------------------------------------------

export class CompanyService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: { search?: string; limit?: number; offset?: number } = {},
  ): Promise<Company[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("companies")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${term}%,legal_name.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "companies.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing companies.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    companyId: string,
  ): Promise<Company> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("companies")
        .select()
        .eq("id", companyId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "companies.get failed");
      if (!data) throw new NotFoundError("Company", companyId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching company.", {
        companyId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateCompanyInput,
  ): Promise<Company> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Company name is required.");
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("companies")
        .insert({
          workspace_id: workspaceId,
          name,
          legal_name: input.legalName ?? null,
          tax_id: input.taxId ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          website: input.website ?? null,
          logo_url: input.logoUrl ?? null,
          address: (input.address ?? null) as never,
          settings: (input.settings ?? {}) as never,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "companies.create failed");
      if (!data) throw new NotFoundError("Company create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating company.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    companyId: string,
    input: UpdateCompanyInput,
  ): Promise<Company> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.legalName !== undefined) patch.legal_name = input.legalName;
    if (input.taxId !== undefined) patch.tax_id = input.taxId;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.website !== undefined) patch.website = input.website;
    if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
    if (input.address !== undefined) patch.address = input.address as never;
    if (input.settings !== undefined) patch.settings = input.settings as never;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("companies")
        .update(patch as never)
        .eq("id", companyId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "companies.update failed");
      if (!data) throw new NotFoundError("Company", companyId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating company.", {
        companyId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    companyId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("companies")
        .delete()
        .eq("id", companyId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "companies.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting company.", {
        companyId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export async function createTransactionService(): Promise<TransactionService> {
  const supabase = await createSupabaseServerClient();
  return new TransactionService(supabase);
}

export async function createAccountingService(): Promise<AccountingService> {
  const supabase = await createSupabaseServerClient();
  return new AccountingService(supabase);
}

export async function createCompanyService(): Promise<CompanyService> {
  const supabase = await createSupabaseServerClient();
  return new CompanyService(supabase);
}
