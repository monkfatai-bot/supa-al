"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import { hasMinimumRole } from "@/services/rbac/permissions";
import { logger } from "@/services/logger";
import { logActivity } from "@/services/activity-log/actions";
import { dispatchEvent } from "@/services/automation/triggers";
import { getPaymentAdapter, getAllPaymentAdapters } from "./adapters";
import type { PaymentProvider } from "@/types/generated/database";
import type {
  PaymentResult,
  VerifyResult,
  WebhookResult,
} from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Standard response shape returned by every payment server action. */
export interface PaymentActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

/** Response returned by initializePayment. */
export interface InitializePaymentResponse extends PaymentActionResponse {
  data?: {
    paymentUrl?: string;
    reference?: string;
  };
}

/** Response returned by verifyPayment. */
export interface VerifyPaymentResponse extends PaymentActionResponse {
  data?: {
    status: "success" | "failed" | "pending";
    amount?: number;
    currency?: string;
  };
}

/** Response returned by processRefund. */
export interface RefundResponse extends PaymentActionResponse {
  data?: {
    refundReference?: string;
    amount?: number;
    status?: string;
  };
}

/** Response returned by getPaymentMethods. */
export interface PaymentMethodsResponse extends PaymentActionResponse {
  data?: {
    methods: Array<{
      provider: PaymentProvider;
      name: string;
      enabled: boolean;
    }>;
    defaultProvider: PaymentProvider;
  };
}

/** Params accepted by initializePayment. */
export interface InitializePaymentParams {
  workspaceId: string;
  invoiceId: string;
  provider?: string;
}

/** Params accepted by verifyPayment. */
export interface VerifyPaymentParams {
  workspaceId: string;
  reference: string;
  provider?: string;
}

/** Params accepted by processRefund. */
export interface ProcessRefundParams {
  workspaceId: string;
  paymentReference: string;
  amount?: number;
  reason?: string;
  provider?: string;
}

/** Params accepted by getPaymentMethods. */
export interface GetPaymentMethodsParams {
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the effective payment provider for a workspace.
 *
 * Uses the explicit `provider` param when given; otherwise falls back
 * to the invoice's `payment_provider` column; finally defaults to 'stripe'.
 */
function resolveProvider(
  explicit: string | undefined,
  invoiceProvider: PaymentProvider | null,
): PaymentProvider {
  if (explicit) return explicit as PaymentProvider;
  if (invoiceProvider && invoiceProvider !== "manual") return invoiceProvider;
  return "stripe";
}

// ---------------------------------------------------------------------------
// initializePayment
// ---------------------------------------------------------------------------

/**
 * Initialize a payment for an invoice via an external payment provider.
 *
 * Verifies workspace membership, fetches the invoice, resolves the
 * payment provider, calls the adapter, and returns the payment URL
 * and reference to the caller.
 */
export async function initializePayment(
  params: InitializePaymentParams,
): Promise<InitializePaymentResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Validate required fields
  if (!params.workspaceId || !params.invoiceId) {
    return {
      success: false,
      message: "workspaceId and invoiceId are required.",
      error: "INVALID_INPUT",
    };
  }

  // Verify workspace membership
  try {
    await verifyWorkspaceMembership(params.workspaceId, profile.id);
  } catch {
    return {
      success: false,
      message: "Access denied.",
      error: "FORBIDDEN",
    };
  }

  // Fetch the invoice and verify it belongs to the workspace
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("id, workspace_id, invoice_number, total, currency, customer_id, status, payment_provider")
    .eq("id", params.invoiceId)
    .single();

  if (fetchError || !invoice) {
    logger.error("initializePayment: invoice not found", {
      invoiceId: params.invoiceId,
      reason: fetchError?.message,
    });
    return {
      success: false,
      message: "Invoice not found.",
      error: "NOT_FOUND",
    };
  }

  if (invoice.workspace_id !== params.workspaceId) {
    return {
      success: false,
      message: "Invoice does not belong to this workspace.",
      error: "FORBIDDEN",
    };
  }

  if (invoice.status === "paid") {
    return {
      success: false,
      message: "This invoice has already been paid.",
      error: "INVALID_STATE",
    };
  }

  // Resolve the payment provider
  const provider = resolveProvider(params.provider, invoice.payment_provider);

  let adapter;
  try {
    adapter = getPaymentAdapter(provider);
  } catch (err) {
    logger.error("initializePayment: unknown provider", {
      provider,
      reason: (err as Error).message,
    });
    return {
      success: false,
      message: `Unsupported payment provider: ${provider}`,
      error: "INVALID_PROVIDER",
    };
  }

  if (!adapter.enabled) {
    return {
      success: false,
      message: `${adapter.name} is not configured. Please configure the payment provider in your settings.`,
      error: "PROVIDER_NOT_CONFIGURED",
    };
  }

  // Fetch customer email for the payment request
  const { data: customer } = await supabase
    .from("customers")
    .select("email, name")
    .eq("id", invoice.customer_id)
    .single();

  // Call the adapter
  const result: PaymentResult = await adapter.initiatePayment({
    amount: Math.round(invoice.total * 100), // Convert to smallest currency unit
    currency: invoice.currency,
    customerEmail: customer?.email,
    customerName: customer?.name ?? undefined,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      workspaceId: params.workspaceId,
    },
  });

  if (!result.success) {
    logger.error("initializePayment: adapter failed", {
      provider,
      reference: result.reference,
      reason: result.error,
    });
    return {
      success: false,
      message: result.error ?? "Payment initialization failed.",
      error: "PAYMENT_FAILED",
    };
  }

  // Update the invoice with the payment reference and provider
  if (result.reference) {
    await supabase
      .from("invoices")
      .update({
        payment_reference: result.reference,
        payment_provider: provider,
        status: "sent" as const,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
  }

  logger.info("Payment initialized", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    provider,
    reference: result.reference,
  });

  await logActivity(
    "document_updated",
    `Initialized ${adapter.name} payment for invoice ${invoice.invoice_number}`,
    {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      provider,
      reference: result.reference,
    },
    params.workspaceId,
  );

  void dispatchEvent({
    eventName: "invoice.payment_initialized",
    workspaceId: params.workspaceId,
    userId: profile.id,
    payload: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      provider,
      reference: result.reference,
    },
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  revalidatePath("/business");

  return {
    success: true,
    message: "Payment initialized successfully.",
    data: {
      paymentUrl: result.paymentUrl,
      reference: result.reference,
    },
  };
}

// ---------------------------------------------------------------------------
// verifyPayment
// ---------------------------------------------------------------------------

/**
 * Verify that a payment was successful by checking with the provider.
 *
 * If the payment is verified and linked to an invoice, the invoice status
 * is updated to 'paid' (or 'partially_paid' depending on the amount).
 */
export async function verifyPayment(
  params: VerifyPaymentParams,
): Promise<VerifyPaymentResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (!params.workspaceId || !params.reference) {
    return {
      success: false,
      message: "workspaceId and reference are required.",
      error: "INVALID_INPUT",
    };
  }

  // Verify workspace membership
  try {
    await verifyWorkspaceMembership(params.workspaceId, profile.id);
  } catch {
    return {
      success: false,
      message: "Access denied.",
      error: "FORBIDDEN",
    };
  }

  // Determine provider: explicit param, or look up from invoice by reference
  let provider: PaymentProvider = (params.provider ?? "stripe") as PaymentProvider;

  if (!params.provider) {
    // Try to find the invoice by payment_reference
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, workspace_id, payment_provider, status, total, amount_paid, currency, invoice_number, customer_id")
      .eq("payment_reference", params.reference)
      .eq("workspace_id", params.workspaceId)
      .single();

    if (invoice?.payment_provider) {
      provider = invoice.payment_provider;
    }
  }

  let adapter;
  try {
    adapter = getPaymentAdapter(provider);
  } catch (err) {
    logger.error("verifyPayment: unknown provider", {
      provider,
      reason: (err as Error).message,
    });
    return {
      success: false,
      message: `Unsupported payment provider: ${provider}`,
      error: "INVALID_PROVIDER",
    };
  }

  // Call the adapter to verify
  const result: VerifyResult = await adapter.verifyPayment(params.reference);

  if (!result.success) {
    logger.error("verifyPayment: verification failed", {
      reference: params.reference,
      provider,
      reason: result.error,
    });
    return {
      success: false,
      message: result.error ?? "Payment verification failed.",
      error: "VERIFICATION_FAILED",
    };
  }

  // If payment is verified as successful, update linked invoice
  if (result.status === "success") {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, workspace_id, status, total, amount_paid, currency, invoice_number, customer_id")
      .eq("payment_reference", params.reference)
      .eq("workspace_id", params.workspaceId)
      .single();

    if (invoice && invoice.status !== "paid") {
      const paidAmount = (result.amount ?? invoice.total - invoice.amount_paid);
      const newAmountPaid = invoice.amount_paid + paidAmount;
      const isFullyPaid = newAmountPaid >= invoice.total;
      const newStatus = isFullyPaid ? "paid" : "partially_paid";

      const updates: Record<string, unknown> = {
        amount_paid: newAmountPaid,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (isFullyPaid) {
        updates.paid_date = new Date().toISOString();
        updates.payment_provider = provider;
      }

      const { error: updateError } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", invoice.id);

      if (updateError) {
        logger.error("verifyPayment: failed to update invoice", {
          invoiceId: invoice.id,
          reason: updateError.message,
        });
      } else {
        logger.info("Invoice marked as paid after verification", {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: paidAmount,
        });

        await logActivity(
          "document_updated",
          `Payment verified and invoice ${invoice.invoice_number} marked as ${newStatus}`,
          { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, amount: paidAmount, newStatus },
          params.workspaceId,
        );

        void dispatchEvent({
          eventName: "invoice.paid",
          workspaceId: params.workspaceId,
          userId: profile.id,
          payload: { invoiceId: invoice.id, amount: paidAmount, paymentMethod: provider },
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  }

  revalidatePath("/business");

  return {
    success: true,
    message:
      result.status === "success"
        ? "Payment verified successfully."
        : result.status === "pending"
          ? "Payment is still pending."
          : "Payment verification returned failed status.",
    data: {
      status: result.status,
      amount: result.amount,
      currency: result.currency,
    },
  };
}

// ---------------------------------------------------------------------------
// processRefund
// ---------------------------------------------------------------------------

/**
 * Process a refund for a previous payment.
 *
 * NOTE: The current PaymentAdapter interface does not expose a native
 * `processRefund` method. This action checks for provider-specific
 * refund support at runtime. If unsupported, it returns a descriptive
 * error message advising the user to process the refund manually
 * through the provider's dashboard.
 */
export async function processRefund(
  params: ProcessRefundParams,
): Promise<RefundResponse> {
  const profile = await requireAuth();

  if (!params.workspaceId || !params.paymentReference) {
    return {
      success: false,
      message: "workspaceId and paymentReference are required.",
      error: "INVALID_INPUT",
    };
  }

  // Verify workspace membership — require admin for refunds
  try {
    const membership = await verifyWorkspaceMembership(
      params.workspaceId,
      profile.id,
    );
    if (!hasMinimumRole(membership.role as import("@/services/rbac/types").Role, "admin")) {
      return {
        success: false,
        message: "Insufficient permissions. Admin role required for refunds.",
        error: "FORBIDDEN",
      };
    }
  } catch {
    return {
      success: false,
      message: "Access denied.",
      error: "FORBIDDEN",
    };
  }

  // Resolve provider
  const provider = (params.provider ?? "stripe") as PaymentProvider;

  let adapter;
  try {
    adapter = getPaymentAdapter(provider);
  } catch (err) {
    logger.error("processRefund: unknown provider", {
      provider,
      reason: (err as Error).message,
    });
    return {
      success: false,
      message: `Unsupported payment provider: ${provider}`,
      error: "INVALID_PROVIDER",
    };
  }

  if (!adapter.enabled) {
    return {
      success: false,
      message: `${adapter.name} is not configured.`,
      error: "PROVIDER_NOT_CONFIGURED",
    };
  }

  // The PaymentAdapter interface does not include processRefund.
  // Check at runtime if the adapter instance has a refund method.
  const adapterWithRefund = adapter as unknown as Record<string, unknown>;
  if (typeof adapterWithRefund.processRefund !== "function") {
    logger.warn("processRefund: not supported by adapter", { provider });
    return {
      success: false,
      message: `Refunds via ${adapter.name} are not yet supported through the API. Please process the refund manually through the ${adapter.name} dashboard.`,
      error: "NOT_SUPPORTED",
    };
  }

  try {
    const refundResult = await (adapterWithRefund.processRefund as (opts: {
      reference: string;
      amount?: number;
      reason?: string;
    }) => Promise<{ success: boolean; refundReference?: string; error?: string }>)({
      reference: params.paymentReference,
      amount: params.amount,
      reason: params.reason,
    });

    if (!refundResult.success) {
      logger.error("processRefund: adapter refund failed", {
        reference: params.paymentReference,
        provider,
        reason: refundResult.error,
      });
      return {
        success: false,
        message: refundResult.error ?? "Refund processing failed.",
        error: "REFUND_FAILED",
      };
    }

    logger.info("Refund processed", {
      reference: params.paymentReference,
      provider,
      refundReference: refundResult.refundReference,
      amount: params.amount,
    });

    await logActivity(
      "document_updated",
      `Processed refund for payment ${params.paymentReference}${params.amount ? ` ($${params.amount})` : ""}${params.reason ? ` — ${params.reason}` : ""}`,
      {
        paymentReference: params.paymentReference,
        provider,
        refundReference: refundResult.refundReference,
        amount: params.amount,
      },
      params.workspaceId,
    );

    revalidatePath("/business");

    return {
      success: true,
      message: "Refund processed successfully.",
      data: {
        refundReference: refundResult.refundReference,
        amount: params.amount,
      },
    };
  } catch (err) {
    logger.error("processRefund: unexpected error", {
      provider,
      reference: params.paymentReference,
      reason: (err as Error).message,
    });
    return {
      success: false,
      message: "An unexpected error occurred while processing the refund.",
      error: "INTERNAL_ERROR",
    };
  }
}

// ---------------------------------------------------------------------------
// getPaymentMethods
// ---------------------------------------------------------------------------

/**
 * Get the list of available payment methods for a workspace.
 *
 * Returns all adapters with their enabled status so the UI can
 * present the user with available options.
 */
export async function getPaymentMethods(
  params: GetPaymentMethodsParams,
): Promise<PaymentMethodsResponse> {
  const profile = await requireAuth();

  if (!params.workspaceId) {
    return {
      success: false,
      message: "workspaceId is required.",
      error: "INVALID_INPUT",
    };
  }

  // Verify workspace membership
  try {
    await verifyWorkspaceMembership(params.workspaceId, profile.id);
  } catch {
    return {
      success: false,
      message: "Access denied.",
      error: "FORBIDDEN",
    };
  }

  const allAdapters = getAllPaymentAdapters();
  const methods = allAdapters.map((adapter) => ({
    provider: adapter.provider,
    name: adapter.name,
    enabled: adapter.enabled,
  }));

  // Default provider is the first enabled adapter, falling back to 'stripe'
  const firstEnabled = methods.find((m) => m.enabled);
  const defaultProvider = firstEnabled?.provider ?? ("stripe" as PaymentProvider);

  return {
    success: true,
    message: "Payment methods retrieved.",
    data: {
      methods,
      defaultProvider,
    },
  };
}

// ---------------------------------------------------------------------------
// handleWebhook (NOT a server action — called from API routes)
// ---------------------------------------------------------------------------

/**
 * Process an incoming webhook payload from a payment provider.
 *
 * This is a regular async function (not a server action) because it is
 * called directly from API route handlers that receive raw HTTP requests
 * from payment providers.
 *
 * Verifies the webhook signature via the adapter, processes the event,
 * and updates relevant invoice records.
 */
export async function handleWebhook(
  payload: unknown,
  provider: PaymentProvider,
  signature: string,
): Promise<WebhookResult> {
  let adapter;
  try {
    adapter = getPaymentAdapter(provider);
  } catch (err) {
    logger.error("handleWebhook: unknown provider", {
      provider,
      reason: (err as Error).message,
    });
    return {
      success: false,
      error: `Unknown payment provider: ${provider}`,
    };
  }

  if (!adapter.enabled) {
    return {
      success: false,
      error: `${adapter.name} is not configured.`,
    };
  }

  // Verify the webhook signature and process the event
  const result = await adapter.processWebhook(payload, signature);

  if (!result.success) {
    logger.error("handleWebhook: adapter processing failed", {
      provider,
      eventType: result.eventType,
      reference: result.reference,
      error: result.error,
    });
    return result;
  }

  // If the event has a reference and indicates a successful payment,
  // update the linked invoice automatically.
  if (result.reference && result.eventType) {
    const isSuccessfulEvent =
      result.eventType.toLowerCase().includes("success") ||
      result.eventType.toLowerCase().includes("completed") ||
      result.eventType.toLowerCase().includes("confirmed");

    const isFailedEvent =
      result.eventType.toLowerCase().includes("failed") ||
      result.eventType.toLowerCase().includes("cancelled");

    if (isSuccessfulEvent || isFailedEvent) {
      const supabase = await createServerSupabaseClient();

      const { data: invoice } = await supabase
        .from("invoices")
        .select("id, workspace_id, status, total, amount_paid, currency, invoice_number, customer_id")
        .eq("payment_reference", result.reference)
        .single();

      if (invoice) {
        if (isSuccessfulEvent && invoice.status !== "paid") {
          const remaining = invoice.total - invoice.amount_paid;
          const newAmountPaid = invoice.amount_paid + remaining;
          const isFullyPaid = newAmountPaid >= invoice.total;
          const newStatus = isFullyPaid ? "paid" : "partially_paid";

          const updates: Record<string, unknown> = {
            amount_paid: newAmountPaid,
            status: newStatus,
            updated_at: new Date().toISOString(),
          };

          if (isFullyPaid) {
            updates.paid_date = new Date().toISOString();
            updates.payment_provider = provider;
          }

          const { error: updateError } = await supabase
            .from("invoices")
            .update(updates)
            .eq("id", invoice.id);

          if (updateError) {
            logger.error("handleWebhook: failed to update invoice", {
              invoiceId: invoice.id,
              reason: updateError.message,
            });
          } else {
            logger.info("handleWebhook: invoice updated via webhook", {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              eventType: result.eventType,
              newStatus,
            });

            await logActivity(
              "document_updated",
              `Invoice ${invoice.invoice_number} automatically marked as ${newStatus} via ${adapter.name} webhook`,
              { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, eventType: result.eventType, provider },
              invoice.workspace_id,
            );

            void dispatchEvent({
              eventName: "invoice.paid",
              workspaceId: invoice.workspace_id,
              payload: { invoiceId: invoice.id, paymentMethod: provider },
              timestamp: new Date().toISOString(),
            }).catch(() => {});
          }
        } else if (isFailedEvent) {
          // Mark the invoice back to 'sent' if it was partially paid, or leave as-is
          if (invoice.status === "partially_paid") {
            await supabase
              .from("invoices")
              .update({ status: "sent", updated_at: new Date().toISOString() })
              .eq("id", invoice.id);
          }

          logger.info("handleWebhook: payment failure event received", {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            eventType: result.eventType,
          });
        }
      }
    }
  }

  return result;
}
