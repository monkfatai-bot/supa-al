"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { dispatchEvent } from "@/services/automation/triggers";
import { createNotification } from "@/services/notification/actions";
import { hasMinimumRole } from "@/services/rbac/permissions";
import type { Role } from "@/services/rbac/types";
import { PAGINATION } from "@/config/constants";
import type {
  Invoice,
  InvoiceItem,
  Receipt,
  UpdateTables,
} from "@/types/generated/database";
import type {
  InvoiceWithItems,
  CreateInvoiceRequest,
  UpdateInvoiceStatusRequest,
  InvoiceDashboardStats,
  InvoiceItemList,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format today as YYYYMMDD for the sequential invoice number prefix.
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
 * Recalculate invoice totals from an array of line items.
 */
function calculateTotals(
  items: InvoiceItemList[],
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
// getNextInvoiceNumber
// ---------------------------------------------------------------------------

export async function getNextInvoiceNumber(
  workspaceId: string
): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const prefix = `INV-${todayStamp()}-`;

  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("workspace_id", workspaceId)
    .ilike("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);

  if (error) {
    logger.error("Failed to query next invoice number", {
      workspaceId,
      reason: error.message,
    });
  }

  if (data && data.length > 0) {
    const lastNumber = data[0].invoice_number;
    // Extract the sequential part after the last dash
    const parts = lastNumber.split("-");
    const seqStr = parts[parts.length - 1];
    const seq = parseInt(seqStr, 10) || 0;
    return `${prefix}${padSeq(seq + 1)}`;
  }

  return `${prefix}${padSeq(1)}`;
}

// ---------------------------------------------------------------------------
// createInvoice
// ---------------------------------------------------------------------------

export async function createInvoice(
  data: CreateInvoiceRequest
): Promise<{ invoice?: Invoice; error?: string }> {
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

  const invoiceNumber = await getNextInvoiceNumber(data.workspaceId);
  const now = new Date().toISOString();
  const issueDate = data.issueDate ?? now;

  const invoiceRow: Record<string, unknown> = {
    workspace_id: data.workspaceId,
    customer_id: data.customerId,
    invoice_number: invoiceNumber,
    status: "draft" as const,
    issue_date: issueDate,
    subtotal,
    tax_rate: effectiveTaxRate,
    tax_amount: taxAmount,
    discount_amount: effectiveDiscount,
    total,
    amount_paid: 0,
    currency: data.currency ?? "USD",
    notes: data.notes ?? "",
    terms: data.terms ?? "",
    payment_reference: "",
    tags: [],
    created_by: profile.id,
    due_date: data.dueDate ?? null,
    company_id: data.companyId ?? null,
  };

  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert(invoiceRow)
    .select()
    .single();

  if (invError || !invoice) {
    logger.error("Failed to create invoice", { reason: invError?.message });
    return { error: "Failed to create invoice." };
  }

  // Insert line items
  const itemRows = data.items.map((item, idx) => ({
    invoice_id: invoice.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    tax_rate: item.taxRate,
    discount_percent: item.discountPercent,
    total: item.total,
    sort_order: idx,
  }));

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemRows);

  if (itemsError) {
    logger.error("Failed to insert invoice items", {
      invoiceId: invoice.id,
      reason: itemsError.message,
    });
    // Best-effort cleanup: delete the invoice we just created
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return { error: "Failed to insert invoice items." };
  }

  logger.info("Invoice created", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
  });
  await logActivity(
    "document_created",
    `Created invoice ${invoice.invoice_number} for $${total.toFixed(2)}`,
    { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, total },
    data.workspaceId
  );
  void dispatchEvent({ eventName: 'invoice.created', workspaceId: data.workspaceId, userId: profile.id, payload: { invoiceId: invoice.id, invoiceNumber, customerId: data.customerId }, timestamp: new Date().toISOString() }).catch(() => {});

  revalidatePath("/business");
  return { invoice };
}

// ---------------------------------------------------------------------------
// updateInvoice
// ---------------------------------------------------------------------------

export async function updateInvoice(
  id: string,
  data: Partial<UpdateTables<"invoices">>
): Promise<{ invoice?: Invoice; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify the invoice exists and belongs to a workspace the user can access
  const { data: existing, error: fetchError } = await supabase
    .from("invoices")
    .select("id, workspace_id, invoice_number")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { error: "Invoice not found." };
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

  const updatePayload: Record<string, unknown> = { ...data, updated_at: new Date().toISOString() };

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error || !invoice) {
    logger.error("Failed to update invoice", { id, reason: error?.message });
    return { error: "Failed to update invoice." };
  }

  logger.info("Invoice updated", { invoiceId: id, invoiceNumber: existing.invoice_number });
  await logActivity(
    "document_updated",
    `Updated invoice ${existing.invoice_number}`,
    { invoiceId: id, invoiceNumber: existing.invoice_number },
    existing.workspace_id
  );

  revalidatePath("/business");
  return { invoice };
}

// ---------------------------------------------------------------------------
// deleteInvoice
// ---------------------------------------------------------------------------

export async function deleteInvoice(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("invoices")
    .select("id, workspace_id, invoice_number, customer_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Invoice not found." };
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

  // Delete items first (should cascade, but explicit for safety)
  const { error: itemsError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);

  if (itemsError) {
    logger.error("Failed to delete invoice items", {
      invoiceId: id,
      reason: itemsError.message,
    });
  }

  const { error: deleteError } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id);

  if (deleteError) {
    logger.error("Failed to delete invoice", { id, reason: deleteError.message });
    return { success: false, error: "Failed to delete invoice." };
  }

  logger.info("Invoice deleted", {
    invoiceId: id,
    invoiceNumber: existing.invoice_number,
  });
  await logActivity(
    "document_deleted",
    `Deleted invoice ${existing.invoice_number}`,
    { invoiceId: id, invoiceNumber: existing.invoice_number },
    existing.workspace_id
  );

  revalidatePath("/business");
  return { success: true };
}

// ---------------------------------------------------------------------------
// getInvoices (paginated list with customer name)
// ---------------------------------------------------------------------------

export async function getInvoices(
  workspaceId: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: string;
    search?: string;
  } = {}
): Promise<{
  invoices: InvoiceWithItems[];
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
    return { invoices: [], total: 0, page, pageSize };
  }

  // Build the base query with a customer name join
  let query = supabase
    .from("invoices")
    .select(
      "*, customer:customers!invoices_customer_id_fkey(name)",
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.search) {
    query = query.or(
      `invoice_number.ilike.%${options.search}%,notes.ilike.%${options.search}%`
    );
  }

  query = query
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch invoices", {
      workspaceId,
      reason: error.message,
    });
    return { invoices: [], total: 0, page, pageSize };
  }

  const invoices: InvoiceWithItems[] = (data ?? []).map((row) => ({
    ...row,
    customer: (row.customer as { name: string } | null) ?? undefined,
  }));

  return { invoices, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// getInvoice (single with items)
// ---------------------------------------------------------------------------

export async function getInvoice(
  id: string
): Promise<InvoiceWithItems | null> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch the invoice
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "*, customer:customers!invoices_customer_id_fkey(name)"
    )
    .eq("id", id)
    .single();

  if (error || !invoice) {
    logger.error("Failed to fetch invoice", { id, reason: error?.message });
    return null;
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", invoice.workspace_id)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return null;
  }

  // Fetch line items
  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });

  return {
    ...invoice,
    items: (items ?? []) as InvoiceItem[],
    customer: (invoice.customer as { name: string } | null) ?? undefined,
  } as InvoiceWithItems;
}

// ---------------------------------------------------------------------------
// updateInvoiceStatus
// ---------------------------------------------------------------------------

export async function updateInvoiceStatus(
  id: string,
  data: UpdateInvoiceStatusRequest
): Promise<{ invoice?: Invoice; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { error: "Invoice not found." };
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

  const updates: Record<string, unknown> = {
    status: data.status,
    updated_at: new Date().toISOString(),
  };

  // Handle "paid" status
  if (data.status === "paid") {
    updates.paid_date = data.paidDate ?? new Date().toISOString();
    updates.amount_paid = existing.total;
    updates.payment_method = data.paymentMethod ?? null;
    updates.payment_provider = data.paymentProvider ?? null;
    updates.payment_reference = data.paymentReference ?? "";
  }

  // Handle "overdue" status — validate that due_date is in the past
  if (data.status === "overdue") {
    if (existing.due_date && new Date(existing.due_date) >= new Date()) {
      return { error: "Cannot mark as overdue: due date has not passed." };
    }
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !invoice) {
    logger.error("Failed to update invoice status", {
      id,
      reason: error?.message,
    });
    return { error: "Failed to update invoice status." };
  }

  // If marked as paid, update customer total_revenue
  if (data.status === "paid") {
    await supabase.rpc("increment_customer_revenue", {
      p_customer_id: existing.customer_id,
      p_amount: existing.total,
    });

    // Also increment total_invoices count if it was not previously paid
    if (existing.status !== "paid" && existing.status !== "partially_paid") {
      await supabase
        .from("customers")
        .update({
          total_invoices: existing.total_invoices + 1,
        })
        .eq("id", existing.customer_id);
    }
  }

  logger.info("Invoice status updated", {
    invoiceId: id,
    invoiceNumber: existing.invoice_number,
    newStatus: data.status,
  });
  await logActivity(
    "document_updated",
    `Invoice ${existing.invoice_number} status changed to ${data.status}`,
    { invoiceId: id, invoiceNumber: existing.invoice_number, status: data.status },
    existing.workspace_id
  );
  void dispatchEvent({ eventName: 'invoice.status_changed', workspaceId: existing.workspace_id, userId: profile.id, payload: { invoiceId: id, status: data.status, previousStatus: existing.status }, timestamp: new Date().toISOString() }).catch(() => {});

  revalidatePath("/business");
  return { invoice };
}

// ---------------------------------------------------------------------------
// recordPayment
// ---------------------------------------------------------------------------

export async function recordPayment(
  invoiceId: string,
  payment: {
    amount: number;
    method: string;
    provider?: string;
    reference?: string;
  }
): Promise<{ invoice?: Invoice; receipt?: Receipt; error?: string }> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (fetchError || !invoice) {
    return { error: "Invoice not found." };
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", invoice.workspace_id)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { error: "Access denied." };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { error: "Insufficient permissions." };

  if (payment.amount <= 0) {
    return { error: "Payment amount must be positive." };
  }

  const newAmountPaid = invoice.amount_paid + payment.amount;
  const isFullyPaid = newAmountPaid >= invoice.total;
  const newStatus = isFullyPaid ? "paid" : "partially_paid";

  // Generate receipt number
  const receiptPrefix = `RCT-${todayStamp()}-`;
  const { data: lastReceipt } = await supabase
    .from("receipts")
    .select("receipt_number")
    .eq("workspace_id", invoice.workspace_id)
    .ilike("receipt_number", `${receiptPrefix}%`)
    .order("receipt_number", { ascending: false })
    .limit(1)
    .single();

  let receiptSeq = 1;
  if (lastReceipt) {
    const parts = lastReceipt.receipt_number.split("-");
    receiptSeq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
  }
  const receiptNumber = `${receiptPrefix}${padSeq(receiptSeq)}`;

  // Create receipt
  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      workspace_id: invoice.workspace_id,
      customer_id: invoice.customer_id,
      receipt_number: receiptNumber,
      amount: payment.amount,
      payment_method: payment.method,
      status: "active" as const,
      notes: `Payment for invoice ${invoice.invoice_number}`,
      qr_code_data: "",
      tags: [],
      created_by: profile.id,
      invoice_id: invoice.id,
      payment_provider: payment.provider ?? null,
      payment_reference: payment.reference ?? "",
    })
    .select()
    .single();

  if (receiptError || !receipt) {
    logger.error("Failed to create receipt", {
      invoiceId,
      reason: receiptError?.message,
    });
    return { error: "Failed to create receipt." };
  }

  // Update invoice payment state
  const invoiceUpdates: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (isFullyPaid) {
    invoiceUpdates.paid_date = new Date().toISOString();
    invoiceUpdates.payment_method = payment.method;
    invoiceUpdates.payment_provider = payment.provider ?? null;
    invoiceUpdates.payment_reference = payment.reference ?? "";
  }

  const { data: updatedInvoice, error: updateError } = await supabase
    .from("invoices")
    .update(invoiceUpdates)
    .eq("id", invoiceId)
    .select()
    .single();

  if (updateError || !updatedInvoice) {
    logger.error("Failed to update invoice after payment", {
      invoiceId,
      reason: updateError?.message,
    });
  }

  // If fully paid, update customer total_revenue
  if (isFullyPaid && invoice.status !== "paid" && invoice.status !== "partially_paid") {
    await supabase
      .from("customers")
      .update({
        total_revenue: invoice.total_revenue + invoice.total,
        total_invoices: invoice.total_invoices + 1,
      })
      .eq("id", invoice.customer_id);
  } else if (isFullyPaid) {
    // Was partially paid before, now fully paid — update revenue
    await supabase
      .from("customers")
      .update({
        total_revenue: invoice.total_revenue + payment.amount,
      })
      .eq("id", invoice.customer_id);
  }

  logger.info("Payment recorded", {
    invoiceId,
    receiptId: receipt.id,
    amount: payment.amount,
    newStatus,
  });
  await logActivity(
    "document_updated",
    `Recorded payment of $${payment.amount.toFixed(2)} for invoice ${invoice.invoice_number}`,
    {
      invoiceId,
      receiptId: receipt.id,
      amount: payment.amount,
      newStatus,
    },
    invoice.workspace_id
  );
  void dispatchEvent({ eventName: 'invoice.paid', workspaceId: invoice.workspace_id, userId: profile.id, payload: { invoiceId, amount: payment.amount, paymentMethod: payment.method }, timestamp: new Date().toISOString() }).catch(() => {});
  void createNotification(profile.id, "success", "Payment Received", `Payment recorded for invoice ${invoice.invoice_number}`, "/business/invoices").catch(() => {});

  revalidatePath("/business");
  return { invoice: updatedInvoice ?? invoice, receipt };
}

// ---------------------------------------------------------------------------
// getInvoiceStats
// ---------------------------------------------------------------------------

export async function getInvoiceStats(
  workspaceId: string
): Promise<InvoiceDashboardStats> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Verify membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", profile.id)
    .single();

  if (!membership) {
    return { totalRevenue: 0, outstandingAmount: 0, overdueCount: 0, paidThisMonth: 0 };
  }

  const stats: InvoiceDashboardStats = {
    totalRevenue: 0,
    outstandingAmount: 0,
    overdueCount: 0,
    paidThisMonth: 0,
  };

  // Total revenue = sum of `total` for all paid invoices
  const { data: paidTotals } = await supabase
    .from("invoices")
    .select("total")
    .eq("workspace_id", workspaceId)
    .eq("status", "paid");

  if (paidTotals) {
    stats.totalRevenue = paidTotals.reduce((sum, row) => sum + row.total, 0);
  }

  // Outstanding = sum of `total` for all sent invoices (not yet paid)
  const { data: sentTotals } = await supabase
    .from("invoices")
    .select("total")
    .eq("workspace_id", workspaceId)
    .eq("status", "sent");

  if (sentTotals) {
    stats.outstandingAmount = sentTotals.reduce((sum, row) => sum + row.total, 0);
  }

  // Overdue count
  const { count: overdueCount, error: overdueError } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "overdue");

  if (!overdueError && overdueCount !== null) {
    stats.overdueCount = overdueCount;
  }

  // Paid this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    .toISOString();

  const { data: paidThisMonth } = await supabase
    .from("invoices")
    .select("total")
    .eq("workspace_id", workspaceId)
    .eq("status", "paid")
    .gte("paid_date", monthStart)
    .lte("paid_date", monthEnd);

  if (paidThisMonth) {
    stats.paidThisMonth = paidThisMonth.reduce(
      (sum, row) => sum + row.total,
      0
    );
  }

  return stats;
}
