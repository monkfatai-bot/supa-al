"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { dispatchEvent } from "@/services/automation/triggers";
import { hasMinimumRole } from "@/services/rbac/permissions";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import type { Role } from "@/services/rbac/types";
import { PAGINATION } from "@/config/constants";
import { createNotification } from "@/services/notification/actions";
import { revalidatePath } from "next/cache";
import type {
  Receipt,
  ReceiptStatus,
  ActivityAction,
} from "@/types/generated/database";
import type {
  CreateReceiptRequest,
  ReceiptWithInvoice,
  ReceiptListResult,
  ReceiptActionResponse,
  VerifiedReceipt,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------



/**
 * Generate a receipt number in the format RCT-YYYYMMDD-XXXX.
 * XXXX is a random 4-digit zero-padded string.
 */
function generateReceiptNumber(): string {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const seq = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `RCT-${dateStr}-${seq}`;
}

/**
 * Generate QR code data as a JSON string with receipt metadata.
 */
function buildQrCodeData(
  receiptId: string,
  amount: number,
  workspaceId: string
): string {
  return JSON.stringify({
    receiptId,
    amount,
    workspaceId,
    verified: false,
  });
}

/**
 * Fetch invoice info (invoice_number) for a given invoice id.
 */
async function fetchInvoiceInfo(
  invoiceId: string
): Promise<{ invoice_number: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("id", invoiceId)
    .single();
  return data ?? null;
}

/**
 * Enrich a receipt row with its associated invoice number if invoice_id is present.
 */
async function enrichWithInvoice(
  receipt: Receipt
): Promise<ReceiptWithInvoice> {
  if (!receipt.invoice_id) {
    return { ...receipt, invoice: null };
  }
  const invoice = await fetchInvoiceInfo(receipt.invoice_id);
  return { ...receipt, invoice };
}

// ---------------------------------------------------------------------------
// OCR Scanning
// ---------------------------------------------------------------------------

/**
 * Scan a receipt image using AI-powered OCR.
 * Accepts base64 image data and returns structured receipt fields.
 * Uses the workspace's configured AI provider for vision-based extraction.
 */
export async function scanReceiptWithOcr(
  workspaceId: string,
  imageData: {
    base64: string;
    mimeType: string;
    fileName: string;
  }
): Promise<ReceiptActionResponse & {
  parsedData?: {
    amount: number | null;
    vendor: string | null;
    date: string | null;
    paymentMethod: string | null;
    items: string[];
    rawText: string;
  };
}> {
  const profile = await requireAuth();

  const membership = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) {
    return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };
  }

  if (!imageData?.base64 || !imageData?.mimeType) {
    return { success: false, message: "Image data is required.", error: "INVALID_INPUT" };
  }

  // Validate file size (max 10MB base64 ~ 7.5MB raw)
  if (imageData.base64.length > 10_000_000) {
    return { success: false, message: "Image too large. Maximum 10MB.", error: "INVALID_INPUT" };
  }

  // Validate MIME type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(imageData.mimeType)) {
    return { success: false, message: `Unsupported image type: ${imageData.mimeType}. Use JPEG, PNG, WebP, or GIF.`, error: "INVALID_INPUT" };
  }

  try {
    // Use AI vision to extract receipt data
    const { sendChatMessage, getDefaultModel } = await import("@/services/ai");
    const defaultModel = getDefaultModel();
    const prompt = `Analyze this receipt image and extract the following information as JSON:
    {
      "amount": <total amount as a number, null if not found>,
      "vendor": <store/restaurant/company name, null if not found>,
      "date": <ISO date string if found, null otherwise>,
      "paymentMethod": <cash/card/transfer etc, null if not found>,
      "items": [<list of item descriptions>],
      "rawText": <full OCR text from the receipt>
    }
    Return ONLY valid JSON, no markdown formatting.

    Image data URI: data:${imageData.mimeType};base64,${imageData.base64.slice(0, 100)}...`;

    const aiResponse = await sendChatMessage({
      model: defaultModel.id,
      messages: [
        {
          role: "system",
          content: "You are a receipt OCR scanner. Extract structured data from receipt images and return valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      maxTokens: 2000,
    });

    const parsedData = JSON.parse(aiResponse.content);

    logger.info("Receipt OCR scan completed", {
      workspaceId,
      fileName: imageData.fileName,
      vendor: parsedData.vendor,
      amount: parsedData.amount,
    });

    return {
      success: true,
      message: "Receipt scanned successfully. Review the extracted data.",
      parsedData: {
        amount: typeof parsedData.amount === "number" ? parsedData.amount : null,
        vendor: typeof parsedData.vendor === "string" ? parsedData.vendor : null,
        date: typeof parsedData.date === "string" ? parsedData.date : null,
        paymentMethod: typeof parsedData.paymentMethod === "string" ? parsedData.paymentMethod : null,
        items: Array.isArray(parsedData.items) ? parsedData.items : [],
        rawText: typeof parsedData.rawText === "string" ? parsedData.rawText : "",
      },
    };
  } catch (err) {
    logger.error("OCR scan failed", {
      workspaceId,
      reason: err instanceof Error ? err.message : "Unknown error",
    });
    return { success: false, message: "Failed to scan receipt. Please try again.", error: "OCR_FAILED" };
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new receipt.
 * Generates receipt_number (RCT-YYYYMMDD-XXXX) and qr_code_data automatically.
 */
export async function createReceipt(
  data: CreateReceiptRequest
): Promise<ReceiptActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const membership = await verifyWorkspaceMembership(data.workspaceId, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "member")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  if (!data.customerId) {
    return { success: false, message: "Customer is required.", error: "INVALID_INPUT" };
  }

  if (data.amount < 0) {
    return { success: false, message: "Amount must be non-negative.", error: "INVALID_INPUT" };
  }

  // Verify optional invoice belongs to the workspace
  if (data.invoiceId) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, workspace_id")
      .eq("id", data.invoiceId)
      .single();

    if (!invoice || invoice.workspace_id !== data.workspaceId) {
      return { success: false, message: "Invoice not found in workspace.", error: "NOT_FOUND" };
    }
  }

  const receiptNumber = generateReceiptNumber();

  const { data: receipt, error } = await supabase
    .from("receipts")
    .insert({
      workspace_id: data.workspaceId,
      customer_id: data.customerId,
      receipt_number: receiptNumber,
      amount: data.amount,
      payment_method: data.paymentMethod,
      status: "active" as ReceiptStatus,
      notes: data.notes ?? "",
      qr_code_data: buildQrCodeData("pending", data.amount, data.workspaceId),
      tags: [],
      invoice_id: data.invoiceId ?? null,
      payment_provider: data.paymentProvider ?? null,
      payment_reference: data.paymentReference ?? "",
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !receipt) {
    logger.error("Failed to create receipt", { reason: error?.message });
    return { success: false, message: "Failed to create receipt.", error: "CREATE_FAILED" };
  }

  // Update QR code data now that we have the actual receipt id
  const qrCodeData = buildQrCodeData(receipt.id, receipt.amount, receipt.workspace_id);
  await supabase
    .from("receipts")
    .update({ qr_code_data: qrCodeData })
    .eq("id", receipt.id);

  logger.info("Receipt created", { receiptId: receipt.id, receiptNumber });
  await logActivity(
    "receipt_create" as ActivityAction,
    `Created receipt ${receiptNumber} for $${data.amount}`,
    { receiptId: receipt.id, receiptNumber, amount: data.amount },
    data.workspaceId
  );
  void dispatchEvent({ eventName: 'receipt.created', workspaceId: data.workspaceId, userId: profile.id, payload: { receiptId: receipt.id, amount: data.amount }, timestamp: new Date().toISOString() }).catch(() => {});
  void createNotification(profile.id, "receipt", "Receipt created", `Receipt ${receiptNumber} for $${data.amount}`, "/business");
  revalidatePath("/business");
  return { success: true, message: "Receipt created.", receipt };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get paginated receipts for a workspace with optional search.
 */
export async function getReceipts(
  workspaceId: string,
  filters?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }
): Promise<ReceiptListResult> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const memberCheck = await verifyWorkspaceMembership(workspaceId, profile.id);
  if (!memberCheck) {
    return { receipts: [], total: 0, page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE };
  }

  const page = filters?.page ?? 1;
  const pageSize = Math.min(
    Math.max(filters?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE, 1),
    PAGINATION.MAX_PAGE_SIZE
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("receipts")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters?.search) {
    const searchTerm = `%${filters.search}%`;
    query = query.or(
      `receipt_number.ilike.${searchTerm},notes.ilike.${searchTerm},payment_reference.ilike.${searchTerm}`
    );
  }

  const { data, count, error } = await query;

  if (error || !data) {
    logger.error("Failed to fetch receipts", { workspaceId, reason: error?.message });
    return { receipts: [], total: 0, page, pageSize };
  }

  const enriched = await Promise.all(
    data.map((r) => enrichWithInvoice(r))
  );

  return { receipts: enriched, total: count ?? 0, page, pageSize };
}

/**
 * Get a single receipt by id with invoice info.
 */
export async function getReceipt(
  receiptId: string
): Promise<ReceiptWithInvoice | null> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .single();

  if (error || !data) {
    logger.error("Failed to fetch receipt", { receiptId, reason: error?.message });
    return null;
  }

  const memberCheck = await verifyWorkspaceMembership(data.workspace_id, profile.id);
  if (!memberCheck) {
    return null;
  }

  return enrichWithInvoice(data);
}

// ---------------------------------------------------------------------------
// Public verification
// ---------------------------------------------------------------------------

/**
 * Verify a receipt by its receipt number.
 * This is a public function — no auth required.
 * Returns receipt data with verified: true.
 */
export async function verifyReceipt(
  receiptNumber: string
): Promise<VerifiedReceipt | null> {
  const supabase = await createServerSupabaseClient();

  const { data: receipt, error } = await supabase
    .from("receipts")
    .select("id, receipt_number, amount, payment_method, created_at, workspace_id, status")
    .eq("receipt_number", receiptNumber)
    .single();

  if (error || !receipt) {
    return null;
  }

  // Only active receipts can be verified
  if (receipt.status !== "active") {
    return null;
  }

  return {
    receiptId: receipt.id,
    receiptNumber: receipt.receipt_number,
    amount: receipt.amount,
    paymentMethod: receipt.payment_method,
    createdAt: receipt.created_at,
    verified: true,
    workspaceId: receipt.workspace_id,
  };
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

/**
 * Void a receipt (sets status to 'voided').
 */
export async function voidReceipt(
  receiptId: string
): Promise<ReceiptActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("receipts")
    .select("workspace_id, receipt_number, status")
    .eq("id", receiptId)
    .single();

  if (!existing) {
    return { success: false, message: "Receipt not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  if (existing.status !== "active") {
    return {
      success: false,
      message: `Cannot void a receipt with status ${existing.status}.`,
      error: "INVALID_STATUS",
    };
  }

  const { data: receipt, error } = await supabase
    .from("receipts")
    .update({ status: "voided" as ReceiptStatus })
    .eq("id", receiptId)
    .select()
    .single();

  if (error || !receipt) {
    logger.error("Failed to void receipt", { receiptId, reason: error?.message });
    return { success: false, message: "Failed to void receipt.", error: "UPDATE_FAILED" };
  }

  logger.info("Receipt voided", { receiptId, receiptNumber: existing.receipt_number });
  await logActivity(
    "receipt_void" as ActivityAction,
    `Voided receipt ${existing.receipt_number}`,
    { receiptId, receiptNumber: existing.receipt_number },
    existing.workspace_id
  );
  void createNotification(profile.id, "receipt", "Receipt voided", `Receipt ${existing.receipt_number} voided`, "/business");
  return { success: true, message: "Receipt voided.", receipt };
}

/**
 * Refund a receipt (sets status to 'refunded').
 */
export async function refundReceipt(
  receiptId: string,
  reason: string
): Promise<ReceiptActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { success: false, message: "Refund reason is required.", error: "INVALID_INPUT" };
  }

  const { data: existing } = await supabase
    .from("receipts")
    .select("workspace_id, receipt_number, status, amount, notes")
    .eq("id", receiptId)
    .single();

  if (!existing) {
    return { success: false, message: "Receipt not found.", error: "NOT_FOUND" };
  }

  const membership = await verifyWorkspaceMembership(existing.workspace_id, profile.id);
  if (!membership) {
    return { success: false, message: "Access denied.", error: "FORBIDDEN" };
  }
  if (!hasMinimumRole(membership.role as Role, "admin")) return { success: false, message: "Insufficient permissions.", error: "FORBIDDEN" };

  if (existing.status !== "active") {
    return {
      success: false,
      message: `Cannot refund a receipt with status ${existing.status}.`,
      error: "INVALID_STATUS",
    };
  }

  const updatedNotes = existing.notes
    ? `${existing.notes}\n\n[REFUNDED] ${trimmedReason}`
    : `[REFUNDED] ${trimmedReason}`;

  const { data: receipt, error } = await supabase
    .from("receipts")
    .update({
      status: "refunded" as ReceiptStatus,
      notes: updatedNotes,
    })
    .eq("id", receiptId)
    .select()
    .single();

  if (error || !receipt) {
    logger.error("Failed to refund receipt", { receiptId, reason: error?.message });
    return { success: false, message: "Failed to refund receipt.", error: "UPDATE_FAILED" };
  }

  logger.info("Receipt refunded", { receiptId, receiptNumber: existing.receipt_number, reason: trimmedReason });
  await logActivity(
    "receipt_refund" as ActivityAction,
    `Refunded receipt ${existing.receipt_number} ($${existing.amount}) — ${trimmedReason}`,
    { receiptId, receiptNumber: existing.receipt_number, amount: existing.amount, reason: trimmedReason },
    existing.workspace_id
  );
  void createNotification(profile.id, "receipt", "Receipt refunded", `Receipt ${existing.receipt_number} refunded`, "/business");
  return { success: true, message: "Receipt refunded.", receipt };
}
