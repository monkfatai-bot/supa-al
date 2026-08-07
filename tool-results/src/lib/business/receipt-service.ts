/**
 * Supa AI — Phase 10 receipt service (server-only).
 *
 * Owns the `receipts` table — payments collected against invoices.
 * CRUD with auto-numbered `REC-YYYY-NNNN` numbers.
 *
 * @module @/lib/business/receipt-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  CreateReceiptInput,
  Receipt,
  UpdateReceiptInput,
} from "./types";
import {
  assertCanWrite,
  assertMember,
  nextNumber,
  toDbError,
  wrapUnexpected,
} from "./core";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

export class ReceiptService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      customerId?: string;
      invoiceId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Receipt[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("receipts")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.customerId) query = query.eq("customer_id", opts.customerId);
      if (opts.invoiceId) query = query.eq("invoice_id", opts.invoiceId);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`number.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "receipts.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing receipts.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    receiptId: string,
  ): Promise<Receipt> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("receipts")
        .select()
        .eq("id", receiptId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "receipts.get failed");
      if (!data) throw new NotFoundError("Receipt", receiptId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching receipt.", {
        receiptId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateReceiptInput,
  ): Promise<Receipt> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    const number =
      input.number ??
      (await nextNumber(this.supabase, workspaceId, "receipts", "REC"));

    try {
      const { data, error } = await this.supabase
        .from("receipts")
        .insert({
          workspace_id: workspaceId,
          customer_id: input.customerId ?? null,
          invoice_id: input.invoiceId ?? null,
          number,
          amount: input.amount ?? 0,
          payment_method: input.paymentMethod ?? "cash",
          payment_date: input.paymentDate ?? new Date().toISOString(),
          notes: input.notes ?? null,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "receipts.create failed");
      if (!data) throw new NotFoundError("Receipt create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating receipt.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    receiptId: string,
    input: UpdateReceiptInput,
  ): Promise<Receipt> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.customerId !== undefined) patch.customer_id = input.customerId;
    if (input.invoiceId !== undefined) patch.invoice_id = input.invoiceId;
    if (input.number !== undefined) patch.number = input.number;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.paymentMethod !== undefined) patch.payment_method = input.paymentMethod;
    if (input.paymentDate !== undefined) patch.payment_date = input.paymentDate;
    if (input.notes !== undefined) patch.notes = input.notes;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("receipts")
        .update(patch as never)
        .eq("id", receiptId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "receipts.update failed");
      if (!data) throw new NotFoundError("Receipt", receiptId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating receipt.", {
        receiptId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    receiptId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("receipts")
        .delete()
        .eq("id", receiptId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "receipts.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting receipt.", {
        receiptId,
      });
    }
  }
}

export async function createReceiptService(): Promise<ReceiptService> {
  const supabase = await createSupabaseServerClient();
  return new ReceiptService(supabase);
}
