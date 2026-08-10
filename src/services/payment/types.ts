import type { PaymentProvider } from "@/types/generated/database";

// ─── Request / Result DTOs ────────────────────────────────────

export interface InitiatePaymentRequest {
  amount: number;
  currency: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  paymentUrl?: string;
  reference?: string;
  error?: string;
}

export interface VerifyResult {
  success: boolean;
  amount?: number;
  currency?: string;
  status: "success" | "failed" | "pending";
  error?: string;
}

export interface WebhookResult {
  success: boolean;
  eventType?: string;
  reference?: string;
  error?: string;
}

// ─── Adapter interface ────────────────────────────────────────

export interface PaymentAdapter {
  readonly name: string;
  readonly provider: PaymentProvider;
  readonly enabled: boolean;
  initiatePayment(data: InitiatePaymentRequest): Promise<PaymentResult>;
  verifyPayment(reference: string): Promise<VerifyResult>;
  processWebhook(payload: unknown, signature: string): Promise<WebhookResult>;
}

// ─── Adapter stubs (for type-safe usage when not configured) ─

export interface StripeAdapter extends PaymentAdapter {
  readonly name: "Stripe";
  readonly provider: "stripe";
}

export interface PaystackAdapter extends PaymentAdapter {
  readonly name: "Paystack";
  readonly provider: "paystack";
}

export interface FlutterwaveAdapter extends PaymentAdapter {
  readonly name: "Flutterwave";
  readonly provider: "flutterwave";
}

// ─── Re-exports ────────────────────────────────────────────────

export type { PaymentProvider };
