/**
 * Supa AI — Phase 10 expense service (server-only).
 *
 * Owns the `expenses` table — money the workspace spends. CRUD +
 * `approve` (sets status to `approved` + stamps `approved_at` and
 * `approved_by`) + `reject` (sets status to `rejected`).
 *
 * @module @/lib/business/expense-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  CreateExpenseInput,
  Expense,
  UpdateExpenseInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class ExpenseService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      status?: string;
      category?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Expense[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("expenses")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.category) query = query.eq("category", opts.category);
      if (opts.dateFrom) query = query.gte("date", opts.dateFrom);
      if (opts.dateTo) query = query.lte("date", opts.dateTo);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `vendor.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "expenses.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing expenses.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    expenseId: string,
  ): Promise<Expense> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("expenses")
        .select()
        .eq("id", expenseId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "expenses.get failed");
      if (!data) throw new NotFoundError("Expense", expenseId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching expense.", {
        expenseId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateExpenseInput,
  ): Promise<Expense> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("expenses")
        .insert({
          workspace_id: workspaceId,
          category: input.category ?? "general",
          amount: input.amount ?? 0,
          currency: input.currency ?? "USD",
          date: input.date ?? new Date().toISOString().slice(0, 10),
          vendor: input.vendor ?? null,
          description: input.description ?? null,
          status: input.status ?? "pending",
          receipt_url: input.receiptUrl ?? null,
          created_by: userId,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "expenses.create failed");
      if (!data) throw new NotFoundError("Expense create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating expense.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<Expense> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.category !== undefined) patch.category = input.category;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.date !== undefined) patch.date = input.date;
    if (input.vendor !== undefined) patch.vendor = input.vendor;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    if (input.approvedBy !== undefined) patch.approved_by = input.approvedBy;
    if (input.approvedAt !== undefined) patch.approved_at = input.approvedAt;
    if (input.receiptUrl !== undefined) patch.receipt_url = input.receiptUrl;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("expenses")
        .update(patch as never)
        .eq("id", expenseId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "expenses.update failed");
      if (!data) throw new NotFoundError("Expense", expenseId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating expense.", {
        expenseId,
      });
    }
  }

  /** Approve an expense — stamps the approver id + timestamp. */
  async approve(
    workspaceId: string,
    userId: string,
    expenseId: string,
  ): Promise<Expense> {
    return this.update(workspaceId, userId, expenseId, {
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
    });
  }

  /** Reject an expense. */
  async reject(
    workspaceId: string,
    userId: string,
    expenseId: string,
  ): Promise<Expense> {
    return this.update(workspaceId, userId, expenseId, {
      status: "rejected",
    });
  }

  async delete(
    workspaceId: string,
    userId: string,
    expenseId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("expenses")
        .delete()
        .eq("id", expenseId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "expenses.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting expense.", {
        expenseId,
      });
    }
  }
}

export async function createExpenseService(): Promise<ExpenseService> {
  const supabase = await createSupabaseServerClient();
  return new ExpenseService(supabase);
}
