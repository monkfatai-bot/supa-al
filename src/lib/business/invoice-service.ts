/**
 * Supa AI — Phase 10 invoice service (server-only).
 *
 * Owns the `invoices` table. CRUD + `markPaid` (flips `status` to `paid`
 * and stamps `paid_at`) + `computeInvoiceTotals` (sums line items, applies
 * tax / discount). New invoices get an auto-generated `number` of the form
 * `INV-YYYY-NNNN` via the shared {@link nextNumber} helper when the
 * caller does not supply one.
 *
 * @module @/lib/business/invoice-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceTotals,
  LineItem,
  UpdateInvoiceInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  nextNumber,
  computeLineTotals,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

/** Server-only service for the `invoices` table. */
export class InvoiceService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      status?: string;
      customerId?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Invoice[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("invoices")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.customerId) query = query.eq("customer_id", opts.customerId);
      if (opts.dateFrom) query = query.gte("issue_date", opts.dateFrom);
      if (opts.dateTo) query = query.lte("issue_date", opts.dateTo);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`number.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "invoices.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing invoices.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    invoiceId: string,
  ): Promise<Invoice> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("invoices")
        .select()
        .eq("id", invoiceId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "invoices.get failed");
      if (!data) throw new NotFoundError("Invoice", invoiceId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching invoice.", {
        invoiceId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateInvoiceInput,
  ): Promise<Invoice> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    const items = input.items ?? [];
    const totals = this.computeInvoiceTotals(items, {
      tax: input.tax,
      discount: input.discount,
      subtotal: input.subtotal,
      total: input.total,
    });

    const number =
      input.number ??
      (await nextNumber(this.supabase, workspaceId, "invoices", "INV"));

    try {
      const { data, error } = await this.supabase
        .from("invoices")
        .insert({
          workspace_id: workspaceId,
          customer_id: input.customerId ?? null,
          number,
          status: input.status ?? "draft",
          issue_date: input.issueDate ?? new Date().toISOString().slice(0, 10),
          due_date: input.dueDate ?? null,
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount: totals.discount,
          total: totals.total,
          currency: input.currency ?? "USD",
          notes: input.notes ?? null,
          items: (items as unknown[]) as never,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "invoices.create failed");
      if (!data) throw new NotFoundError("Invoice create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating invoice.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    invoiceId: string,
    input: UpdateInvoiceInput,
  ): Promise<Invoice> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    const patch: Record<string, unknown> = {};
    if (input.customerId !== undefined) patch.customer_id = input.customerId;
    if (input.number !== undefined) patch.number = input.number;
    if (input.status !== undefined) patch.status = input.status;
    if (input.issueDate !== undefined) patch.issue_date = input.issueDate;
    if (input.dueDate !== undefined) patch.due_date = input.dueDate;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.notes !== undefined) patch.notes = input.notes;

    // Recompute totals when items / money fields change.
    const moneyChanged =
      input.items !== undefined ||
      input.tax !== undefined ||
      input.discount !== undefined ||
      input.subtotal !== undefined ||
      input.total !== undefined;
    if (moneyChanged) {
      // Fetch existing so we can blend new + old line items.
      const { data: existing, error: fetchErr } = await this.supabase
        .from("invoices")
        .select()
        .eq("id", invoiceId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "invoices.update lookup failed");
      if (!existing) throw new NotFoundError("Invoice", invoiceId);

      const existingItems = (existing.items ?? []) as unknown as LineItem[];
      const items = input.items ?? existingItems;
      const totals = this.computeInvoiceTotals(items, {
        tax: input.tax ?? Number(existing.tax ?? 0),
        discount: input.discount ?? Number(existing.discount ?? 0),
        subtotal: input.subtotal ?? Number(existing.subtotal ?? 0),
        total: input.total ?? Number(existing.total ?? 0),
      });
      patch.items = items as unknown[];
      patch.subtotal = totals.subtotal;
      patch.tax = totals.tax;
      patch.discount = totals.discount;
      patch.total = totals.total;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("invoices")
        .update(patch as never)
        .eq("id", invoiceId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "invoices.update failed");
      if (!data) throw new NotFoundError("Invoice", invoiceId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating invoice.", {
        invoiceId,
      });
    }
  }

  /** Mark an invoice as paid + stamp the `paid_at` timestamp. */
  async markPaid(
    workspaceId: string,
    userId: string,
    invoiceId: string,
    paidAt: string = new Date().toISOString(),
  ): Promise<Invoice> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { data, error } = await this.supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: paidAt,
        } as never)
        .eq("id", invoiceId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "invoices.markPaid failed");
      if (!data) throw new NotFoundError("Invoice", invoiceId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure marking invoice paid.", {
        invoiceId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    invoiceId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "invoices.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting invoice.", {
        invoiceId,
      });
    }
  }

  /**
   * Compute the four money fields for an invoice (subtotal, tax, discount,
   * total). When the caller supplies explicit `subtotal` / `total`
   * overrides, those win — useful for fixed-amount invoices that don't
   * match the line-item sum exactly (e.g. a "remaining balance" invoice).
   */
  computeInvoiceTotals(
    items: LineItem[],
    opts: {
      tax?: number;
      discount?: number;
      subtotal?: number;
      total?: number;
    } = {},
  ): InvoiceTotals {
    const lineTotals = computeLineTotals(items, {
      tax: opts.tax,
      discount: opts.discount,
    });
    return {
      subtotal: opts.subtotal ?? lineTotals.subtotal,
      tax: lineTotals.tax,
      discount: lineTotals.discount,
      total: opts.total ?? lineTotals.total,
    };
  }
}

export async function createInvoiceService(): Promise<InvoiceService> {
  const supabase = await createSupabaseServerClient();
  return new InvoiceService(supabase);
}
