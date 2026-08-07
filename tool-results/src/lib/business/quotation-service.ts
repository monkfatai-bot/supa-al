/**
 * Supa AI — Phase 10 quotation service (server-only).
 *
 * Owns the `quotations` table. Same shape as {@link InvoiceService} minus
 * `markPaid` (quotations have no payment flow — accept / reject instead).
 *
 * @module @/lib/business/quotation-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  CreateQuotationInput,
  Quotation,
  UpdateQuotationInput,
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

export class QuotationService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async list(
    workspaceId: string,
    userId: string,
    opts: {
      search?: string;
      status?: string;
      customerId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Quotation[]> {
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    );
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      await assertMember(this.supabase, workspaceId, userId);
      let query = this.supabase
        .from("quotations")
        .select()
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (opts.customerId) query = query.eq("customer_id", opts.customerId);
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`number.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "quotations.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure listing quotations.", {
        workspaceId,
      });
    }
  }

  async get(
    workspaceId: string,
    userId: string,
    quotationId: string,
  ): Promise<Quotation> {
    try {
      await assertMember(this.supabase, workspaceId, userId);
      const { data, error } = await this.supabase
        .from("quotations")
        .select()
        .eq("id", quotationId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "quotations.get failed");
      if (!data) throw new NotFoundError("Quotation", quotationId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure fetching quotation.", {
        quotationId,
      });
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateQuotationInput,
  ): Promise<Quotation> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    const items = input.items ?? [];
    const totals = computeLineTotals(items, {
      tax: input.tax,
      discount: input.discount,
    });

    const number =
      input.number ??
      (await nextNumber(this.supabase, workspaceId, "quotations", "QUO"));

    try {
      const { data, error } = await this.supabase
        .from("quotations")
        .insert({
          workspace_id: workspaceId,
          customer_id: input.customerId ?? null,
          number,
          status: input.status ?? "draft",
          valid_until: input.validUntil ?? null,
          subtotal: input.subtotal ?? totals.subtotal,
          tax: totals.tax,
          discount: totals.discount,
          total: input.total ?? totals.total,
          currency: input.currency ?? "USD",
          items: (items as unknown[]) as never,
          notes: input.notes ?? null,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "quotations.create failed");
      if (!data) throw new NotFoundError("Quotation create returned no row.");
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure creating quotation.", {
        workspaceId,
      });
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    quotationId: string,
    input: UpdateQuotationInput,
  ): Promise<Quotation> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    const patch: Record<string, unknown> = {};
    if (input.customerId !== undefined) patch.customer_id = input.customerId;
    if (input.number !== undefined) patch.number = input.number;
    if (input.status !== undefined) patch.status = input.status;
    if (input.validUntil !== undefined) patch.valid_until = input.validUntil;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.notes !== undefined) patch.notes = input.notes;

    const moneyChanged =
      input.items !== undefined ||
      input.tax !== undefined ||
      input.discount !== undefined ||
      input.subtotal !== undefined ||
      input.total !== undefined;
    if (moneyChanged) {
      const { data: existing, error: fetchErr } = await this.supabase
        .from("quotations")
        .select()
        .eq("id", quotationId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (fetchErr) throw toDbError(fetchErr, "quotations.update lookup failed");
      if (!existing) throw new NotFoundError("Quotation", quotationId);

      const items = input.items ?? ((existing.items ?? []) as never);
      const totals = computeLineTotals(items as never, {
        tax: input.tax ?? Number(existing.tax ?? 0),
        discount: input.discount ?? Number(existing.discount ?? 0),
      });
      patch.items = items;
      patch.subtotal = input.subtotal ?? totals.subtotal;
      patch.tax = totals.tax;
      patch.discount = totals.discount;
      patch.total = input.total ?? totals.total;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("quotations")
        .update(patch as never)
        .eq("id", quotationId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "quotations.update failed");
      if (!data) throw new NotFoundError("Quotation", quotationId);
      return data;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure updating quotation.", {
        quotationId,
      });
    }
  }

  async delete(
    workspaceId: string,
    userId: string,
    quotationId: string,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { error } = await this.supabase
        .from("quotations")
        .delete()
        .eq("id", quotationId)
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "quotations.delete failed");
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure deleting quotation.", {
        quotationId,
      });
    }
  }
}

export async function createQuotationService(): Promise<QuotationService> {
  const supabase = await createSupabaseServerClient();
  return new QuotationService(supabase);
}
