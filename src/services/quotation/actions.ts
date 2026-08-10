"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { dispatchEvent } from "@/services/automation/triggers";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";
import { PAGINATION } from "@/config/constants";
import { createNotification } from "@/services/notification/actions";
import { getNextInvoiceNumber } from "@/services/invoice/actions";
import type {
  Quotation,
  QuotationItem,
  QuotationStatus,
  UpdateTables,
} from "@/types/generated/database";
import type {
  QuotationWithItems,
  CreateQuotationRequest,
  QuotationItemList,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format today as YYYYMMDD for the sequential quote number prefix.
 */
function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Pad a sequence number to 4 digits: 1 -> "0001".
 */
function padSeq(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Recalculate quotation totals from line items.
 */
function calculateTotals(
  items: QuotationItemList[],
  taxRate: number,
  discountAmount: number
) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount - discountAmount;
  return { subtotal, taxAmount, total };
}

// ---------------------------------------------------------------------------
// getNextQuotationNumber
// ---------------------------------------------------------------------------

export async function getNextQuotationNumber(
  workspaceId: string
): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const prefix = `QUO-${todayStamp()}-`;

  const { data, error } = await supabase
    .from("quotations")
    .select("quote_number")
    .eq("workspace_id", workspaceId)
    .ilike("quote_number", `${prefix}%`)
    .order("quote_number", { ascending: false })
    .limit(1);

  if (error) {
    logger.error("Failed to query next quotation number", {
      workspaceId,
      reason: error.message,
    });
  }

  if (data && data.length > 0) {
    const lastNumber = data[0].quote_number;
    const parts = lastNumber.split("-");
    const seqStr = parts[parts.length - 1];
    const seq = parseInt(seqStr, 10) || 0;
    return `${prefix}${padSeq(seq + 1)}`;
  }

  return `${prefix}${padSeq(1)}`;
}

// ---------------------------------------------------------------------------
// createQuotation
// ---------------------------------------------------------------------------

export async function createQuotation(
  data: CreateQuotationRequest
): Promise<{ quotation?: Quotation; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", data.workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership) return { error: "Access denied." };
  if (!hasMinimumRole(membership.role as Role, "member")) return { error: "Insufficient permissions." };

  if (!data.workspaceId || !data.customerId) {
    return { error: "workspaceId and customerId are required." };
  }

  if (!data.items || data.items.length === 0) {
    return { error: "At least one item is required." };
  }

  const effectiveTaxRate = data.taxRate ?? 0;
  const effectiveDiscount = data.discountAmount ?? 0;
  const { subtotal, taxAmount, total } = calculateTotals(
    data.items,
    effectiveTaxRate,
    effectiveDiscount
  );

  const quoteNumber = await getNextQuotationNumber(data.workspaceId);
  const now = new Date().toISOString();

  const quotationRow: Record<string, unknown> = {
    workspace_id: data.workspaceId,
    customer_id: data.customerId,
    quote_number: quoteNumber,
    status: "draft" as const,
    issue_date: now,
    subtotal,
    tax_rate: effectiveTaxRate,
    tax_amount: taxAmount,
    discount_amount: effectiveDiscount,
    total,
    currency: data.currency ?? "USD",
    notes: data.notes ?? "",
    terms: data.terms ?? "",
    tags: [],
    created_by: profile.id,
    valid_until: data.validUntil ?? null,
    company_id: data.companyId ?? null,
  };

  const { data: quotation, error: qError } = await supabase
    .from("quotations")
    .insert(quotationRow)
    .select()
    .single();

  if (qError || !quotation) {
    logger.error("Failed to create quotation", { reason: qError?.message });
    return { error: "Failed to create quotation." };
  }

  // Insert line items
  const itemRows = data.items.map((item, idx) => ({
    quotation_id: quotation.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    tax_rate: item.taxRate,
    discount_percent: item.discountPercent,
    total: item.total,
    sort_order: idx,
  }));

  const { error: itemsError } = await supabase
    .from("quotation_items")
    .insert(itemRows);

  if (itemsError) {
    logger.error("Failed to insert quotation items", {
      quotationId: quotation.id,
      reason: itemsError.message,
    });
    // Best-effort cleanup
    await supabase.from("quotations").delete().eq("id", quotation.id);
    return { error: "Failed to insert quotation items." };
  }

  logger.info("Quotation created", {
    quotationId: quotation.id,
    quoteNumber: quotation.quote_number,
  });
  await logActivity(
    "document_created",
    `Created quotation ${quotation.quote_number} for $${total.toFixed(2)}`,
    { quotationId: quotation.id, quoteNumber: quotation.quote_number, total },
    data.workspaceId
  );
  void dispatchEvent({ eventName: 'quotation.created', workspaceId: data.workspaceId, userId: profile.id, payload: { quotationId: quotation.id, quoteNumber: quotation.quote_number }, timestamp: new Date().toISOString() }).catch(() => {});
  void createNotification(profile.id, "quotation", "Quotation created", `Quotation ${quotation.quote_number} created`, "/business");

  revalidatePath("/business");
  return { quotation };
}

// ---------------------------------------------------------------------------
// updateQuotation
// ---------------------------------------------------------------------------

export async function updateQuotation(
  id: string,
  data: Partial<UpdateTables<"quotations">>
): Promise<{ quotation?: Quotation; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("quotations")
    .select("id, workspace_id, quote_number")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { error: "Quotation not found." };
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", existing.workspace_id)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { error: "Access denied." };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { error: "Insufficient permissions." };

  const updatePayload: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  const { data: quotation, error } = await supabase
    .from("quotations")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error || !quotation) {
    logger.error("Failed to update quotation", {
      id,
      reason: error?.message,
    });
    return { error: "Failed to update quotation." };
  }

  logger.info("Quotation updated", {
    quotationId: id,
    quoteNumber: existing.quote_number,
  });
  await logActivity(
    "document_updated",
    `Updated quotation ${existing.quote_number}`,
    { quotationId: id, quoteNumber: existing.quote_number },
    existing.workspace_id
  );

  void createNotification(profile.id, "quotation", "Quotation updated", `Quotation ${existing.quote_number} updated`, "/business");

  revalidatePath("/business");
  return { quotation };
}

// ---------------------------------------------------------------------------
// deleteQuotation
// ---------------------------------------------------------------------------

export async function deleteQuotation(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("quotations")
    .select("id, workspace_id, quote_number")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Quotation not found." };
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", existing.workspace_id)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { success: false, error: "Access denied." };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, error: "Insufficient permissions." };

  // Delete items first (explicit for safety; DB should cascade)
  await supabase
    .from("quotation_items")
    .delete()
    .eq("quotation_id", id);

  const { error: deleteError } = await supabase
    .from("quotations")
    .delete()
    .eq("id", id);

  if (deleteError) {
    logger.error("Failed to delete quotation", {
      id,
      reason: deleteError.message,
    });
    return { success: false, error: "Failed to delete quotation." };
  }

  logger.info("Quotation deleted", {
    quotationId: id,
    quoteNumber: existing.quote_number,
  });
  await logActivity(
    "document_deleted",
    `Deleted quotation ${existing.quote_number}`,
    { quotationId: id, quoteNumber: existing.quote_number },
    existing.workspace_id
  );

  revalidatePath("/business");
  return { success: true };
}

// ---------------------------------------------------------------------------
// getQuotations (paginated list with customer name)
// ---------------------------------------------------------------------------

export async function getQuotations(
  workspaceId: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
  } = {}
): Promise<{
  quotations: QuotationWithItems[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const page = options.page ?? 1;
  const pageSize = Math.min(
    options.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE,
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Verify membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { quotations: [], total: 0, page, pageSize };
  }

  let query = supabase
    .from("quotations")
    .select("*, customer:customers!quotations_customer_id_fkey(name)", {
      count: "exact",
    })
    .eq("workspace_id", workspaceId);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.search) {
    query = query.or(
      `quote_number.ilike.%${options.search}%,notes.ilike.%${options.search}%`
    );
  }

  query = query
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch quotations", {
      workspaceId,
      reason: error.message,
    });
    return { quotations: [], total: 0, page, pageSize };
  }

  const quotations: QuotationWithItems[] = (data ?? []).map((row) => ({
    ...row,
    customer: (row.customer as { name: string } | null) ?? undefined,
  }));

  return { quotations, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// getQuotation (single with items)
// ---------------------------------------------------------------------------

export async function getQuotation(
  id: string
): Promise<QuotationWithItems | null> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: quotation, error } = await supabase
    .from("quotations")
    .select("*, customer:customers!quotations_customer_id_fkey(name)")
    .eq("id", id)
    .single();

  if (error || !quotation) {
    logger.error("Failed to fetch quotation", { id, reason: error?.message });
    return null;
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", quotation.workspace_id)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return null;
  }

  // Fetch line items
  const { data: items } = await supabase
    .from("quotation_items")
    .select("*")
    .eq("quotation_id", id)
    .order("sort_order", { ascending: true });

  return {
    ...quotation,
    items: (items ?? []) as QuotationItem[],
    customer: (quotation.customer as { name: string } | null) ?? undefined,
  } as QuotationWithItems;
}

// ---------------------------------------------------------------------------
// updateQuotationStatus
// ---------------------------------------------------------------------------

export async function updateQuotationStatus(
  id: string,
  status: QuotationStatus
): Promise<{ quotation?: Quotation; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("quotations")
    .select("id, workspace_id, quote_number, status")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { error: "Quotation not found." };
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", existing.workspace_id)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { error: "Access denied." };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { error: "Insufficient permissions." };

  // Prevent updating already-converted quotations
  if (existing.status === "converted") {
    return { error: "Cannot update a converted quotation." };
  }

  const { data: quotation, error } = await supabase
    .from("quotations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !quotation) {
    logger.error("Failed to update quotation status", {
      id,
      reason: error?.message,
    });
    return { error: "Failed to update quotation status." };
  }

  logger.info("Quotation status updated", {
    quotationId: id,
    quoteNumber: existing.quote_number,
    newStatus: status,
  });
  await logActivity(
    "document_updated",
    `Quotation ${existing.quote_number} status changed to ${status}`,
    { quotationId: id, quoteNumber: existing.quote_number, status },
    existing.workspace_id
  );

  void createNotification(profile.id, "quotation", "Quotation status updated", `Quotation ${existing.quote_number} status changed to ${status}`, "/business");

  revalidatePath("/business");
  return { quotation };
}

// ---------------------------------------------------------------------------
// convertQuotationToInvoice
// ---------------------------------------------------------------------------

export async function convertQuotationToInvoice(
  quotationId: string
): Promise<{ invoiceId?: string; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch quotation with items
  const quotation = await getQuotation(quotationId);

  if (!quotation) {
    return { error: "Quotation not found." };
  }

  if (quotation.status === "converted") {
    return { error: "Quotation has already been converted." };
  }

  if (quotation.converted_invoice_id) {
    return { error: "Quotation already has a linked invoice." };
  }

  // Generate invoice number
  const invoiceNumber = await getNextInvoiceNumber(quotation.workspace_id);
  const now = new Date().toISOString();

  // Calculate a default due date: 30 days from now
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  // Create the invoice row from quotation data
  const invoiceRow: Record<string, unknown> = {
    workspace_id: quotation.workspace_id,
    customer_id: quotation.customer_id,
    company_id: quotation.company_id,
    invoice_number: invoiceNumber,
    status: "draft" as const,
    issue_date: now,
    due_date: dueDate.toISOString(),
    subtotal: quotation.subtotal,
    tax_rate: quotation.tax_rate,
    tax_amount: quotation.tax_amount,
    discount_amount: quotation.discount_amount,
    total: quotation.total,
    amount_paid: 0,
    currency: quotation.currency,
    notes: quotation.notes,
    terms: quotation.terms,
    payment_reference: "",
    tags: quotation.tags,
    created_by: profile.id,
    quotation_id: quotation.id,
  };

  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert(invoiceRow)
    .select()
    .single();

  if (invError || !invoice) {
    logger.error("Failed to create invoice from quotation", {
      quotationId,
      reason: invError?.message,
    });
    return { error: "Failed to create invoice from quotation." };
  }

  // Copy quotation items to invoice items
  if (quotation.items && quotation.items.length > 0) {
    const invoiceItemRows = quotation.items.map((item, idx) => ({
      invoice_id: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      discount_percent: item.discount_percent,
      total: item.total,
      sort_order: item.sort_order ?? idx,
    }));

    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(invoiceItemRows);

    if (itemsError) {
      logger.error("Failed to copy quotation items to invoice", {
        quotationId,
        invoiceId: invoice.id,
        reason: itemsError.message,
      });
      // Cleanup: remove the invoice we just created
      await supabase.from("invoices").delete().eq("id", invoice.id);
      return { error: "Failed to copy quotation items to invoice." };
    }
  }

  // Update the quotation to mark it as converted
  const { error: updateQError } = await supabase
    .from("quotations")
    .update({
      status: "converted" as const,
      converted_invoice_id: invoice.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotationId);

  if (updateQError) {
    logger.error("Failed to update quotation after conversion", {
      quotationId,
      reason: updateQError.message,
    });
    // Non-fatal — the invoice was created successfully
  }

  logger.info("Quotation converted to invoice", {
    quotationId,
    quoteNumber: quotation.quote_number,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
  });
  await logActivity(
    "document_exported",
    `Converted quotation ${quotation.quote_number} to invoice ${invoice.invoice_number}`,
    {
      quotationId,
      quoteNumber: quotation.quote_number,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    },
    quotation.workspace_id
  );

  void createNotification(profile.id, "quotation", "Quotation converted", `Quotation ${quotation.quote_number} converted to invoice`, "/business");

  revalidatePath("/business");
  return { invoiceId: invoice.id };
}
