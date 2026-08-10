import nodeCrypto from "node:crypto";
const crypto = nodeCrypto;

import { env } from "@/config/env";
import { logger } from "@/services/logger";
import type { PaymentProvider } from "@/types/generated/database";
import type {
  PaymentAdapter,
  InitiatePaymentRequest,
  PaymentResult,
  VerifyResult,
  WebhookResult,
  StripeAdapter,
  PaystackAdapter,
  FlutterwaveAdapter,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// STRIPE ADAPTER
// ═══════════════════════════════════════════════════════════════

class StripePaymentAdapter implements StripeAdapter {
  readonly name = "Stripe" as const;
  readonly provider = "stripe" as const;
  readonly enabled: boolean;

  constructor() {
    this.enabled = Boolean(env.STRIPE_SECRET_KEY);
  }

  async initiatePayment(data: InitiatePaymentRequest): Promise<PaymentResult> {
    if (!this.enabled) {
      return { success: false, error: "Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables." };
    }

    try {
      const params = new URLSearchParams();
      params.append("amount", String(Math.round(data.amount * 100))); // Stripe uses cents
      params.append("currency", data.currency.toLowerCase());
      params.append("automatic_payment_methods[enabled]", "true");

      if (data.customerEmail) {
        params.append("receipt_email", data.customerEmail);
      }
      if (data.metadata && Object.keys(data.metadata).length > 0) {
        for (const [key, value] of Object.entries(data.metadata)) {
          params.append(`metadata[${key}]`, value);
        }
      }

      const response = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${env.STRIPE_SECRET_KEY}:`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      const result = await response.json() as {
        id?: string;
        client_secret?: string;
        error?: { message?: string };
      };

      if (!response.ok || result.error) {
        const msg = result.error?.message ?? `Stripe API returned status ${response.status}`;
        logger.error("Stripe initiatePayment failed", { status: response.status, error: msg });
        return { success: false, error: msg };
      }

      return {
        success: true,
        reference: result.id,
        paymentUrl: undefined, // Stripe uses client_secret on the frontend
      };
    } catch (err) {
      logger.error("Stripe initiatePayment error", { reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, error: "Failed to initiate Stripe payment." };
    }
  }

  async verifyPayment(reference: string): Promise<VerifyResult> {
    if (!this.enabled) {
      return { success: false, status: "failed", error: "Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables." };
    }

    try {
      const response = await fetch(
        `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(reference)}`,
        {
          headers: {
            "Authorization": `Basic ${Buffer.from(`${env.STRIPE_SECRET_KEY}:`).toString("base64")}`,
          },
        }
      );

      const result = await response.json() as {
        id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        error?: { message?: string };
      };

      if (!response.ok || result.error) {
        const msg = result.error?.message ?? `Stripe API returned status ${response.status}`;
        logger.error("Stripe verifyPayment failed", { reference, status: response.status, error: msg });
        return { success: false, status: "failed", error: msg };
      }

      const status = result.status === "succeeded" ? "success" : result.status === "processing" ? "pending" : "failed";

      return {
        success: status === "success",
        amount: result.amount ? result.amount / 100 : undefined,
        currency: result.currency,
        status,
      };
    } catch (err) {
      logger.error("Stripe verifyPayment error", { reference, reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, status: "failed", error: "Failed to verify Stripe payment." };
    }
  }

  async processWebhook(payload: unknown, signature: string): Promise<WebhookResult> {
    if (!this.enabled) {
      return { success: false, error: "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in environment variables." };
    }

    if (!(env.STRIPE_WEBHOOK_SECRET ?? "")) {
      return { success: false, error: "Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET in environment variables." };
    }

    try {
      // Verify the Stripe webhook signature
      // Stripe signs with their webhook secret using HMAC-SHA256
      // The payload should be the raw string body for signature verification

      // Stripe sends timestamp and signature in the format: t=timestamp,v1=signature
      const elements = signature.split(",");
      const timestamp = elements.find((e) => e.startsWith("t="))?.slice(2) ?? "";
      const v1Signature = elements.find((e) => e.startsWith("v1="))?.slice(3) ?? "";

      if (!timestamp || !v1Signature) {
        return { success: false, error: "Invalid Stripe webhook signature format." };
      }

      // Check timestamp freshness (reject events older than 5 minutes)
      const eventAge = Math.floor(Date.now() / 1000) - Number(timestamp);
      if (eventAge > 300) {
        return { success: false, error: "Stripe webhook timestamp is too old." };
      }

      const signedPayload = `${timestamp}.${typeof payload === "string" ? payload : JSON.stringify(payload)}`;
      const expectedSig = crypto
        .createHmac("sha256", env.STRIPE_WEBHOOK_SECRET ?? "")
        .update(signedPayload)
        .digest("hex");

      if (expectedSig !== v1Signature) {
        return { success: false, error: "Stripe webhook signature verification failed." };
      }

      // Parse the event payload
      const event = typeof payload === "string" ? JSON.parse(payload) : (payload as Record<string, unknown>);
      const eventType = String(event.type ?? "unknown");
      const data = event.data as { object?: { id?: string; payment_intent?: string } } | undefined;
      const reference = data?.object?.payment_intent ?? data?.object?.id ?? undefined;

      logger.info("Stripe webhook processed", { eventType, reference });
      return { success: true, eventType, reference };
    } catch (err) {
      logger.error("Stripe processWebhook error", { reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, error: "Failed to process Stripe webhook." };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAYSTACK ADAPTER
// ═══════════════════════════════════════════════════════════════

class PaystackPaymentAdapter implements PaystackAdapter {
  readonly name = "Paystack" as const;
  readonly provider = "paystack" as const;
  readonly enabled: boolean;

  constructor() {
    this.enabled = Boolean(env.PAYSTACK_SECRET_KEY ?? "");
  }

  async initiatePayment(data: InitiatePaymentRequest): Promise<PaymentResult> {
    if (!this.enabled) {
      return { success: false, error: "Paystack is not configured. Set PAYSTACK_SECRET_KEY in environment variables." };
    }

    try {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(data.amount * 100), // Paystack uses kobo/cents
          email: data.customerEmail ?? "customer@example.com",
          currency: data.currency.toUpperCase(),
          metadata: data.metadata ?? {},
        }),
      });

      const result = await response.json() as {
        status: boolean;
        message?: string;
        data?: {
          reference?: string;
          authorization_url?: string;
          amount?: number;
        };
      };

      if (!response.ok || !result.status || !result.data) {
        const msg = result.message ?? `Paystack API returned status ${response.status}`;
        logger.error("Paystack initiatePayment failed", { status: response.status, error: msg });
        return { success: false, error: msg };
      }

      return {
        success: true,
        reference: result.data.reference,
        paymentUrl: result.data.authorization_url,
      };
    } catch (err) {
      logger.error("Paystack initiatePayment error", { reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, error: "Failed to initiate Paystack payment." };
    }
  }

  async verifyPayment(reference: string): Promise<VerifyResult> {
    if (!this.enabled) {
      return { success: false, status: "failed", error: "Paystack is not configured. Set PAYSTACK_SECRET_KEY in environment variables." };
    }

    try {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            "Authorization": `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          },
        }
      );

      const result = await response.json() as {
        status: boolean;
        message?: string;
        data?: {
          status?: string;
          amount?: number;
          currency?: string;
          reference?: string;
        };
      };

      if (!response.ok || !result.status || !result.data) {
        const msg = result.message ?? `Paystack API returned status ${response.status}`;
        logger.error("Paystack verifyPayment failed", { reference, status: response.status, error: msg });
        return { success: false, status: "failed", error: msg };
      }

      const txStatus = result.data.status === "success" ? "success" : result.data.status === "pending" ? "pending" : "failed";

      return {
        success: txStatus === "success",
        amount: result.data.amount ? result.data.amount / 100 : undefined,
        currency: result.data.currency,
        status: txStatus,
      };
    } catch (err) {
      logger.error("Paystack verifyPayment error", { reference, reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, status: "failed", error: "Failed to verify Paystack payment." };
    }
  }

  async processWebhook(payload: unknown, signature: string): Promise<WebhookResult> {
    if (!this.enabled) {
      return { success: false, error: "Paystack is not configured. Set PAYSTACK_SECRET_KEY in environment variables." };
    }

    try {
      // Verify the Paystack webhook signature using the secret key as HMAC

      const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
      const expectedSig = crypto
        .createHmac("sha512", env.PAYSTACK_SECRET_KEY ?? "")
        .update(rawBody)
        .digest("hex");

      if (expectedSig !== signature) {
        return { success: false, error: "Paystack webhook signature verification failed." };
      }

      const event = typeof payload === "string" ? JSON.parse(payload) : (payload as Record<string, unknown>);
      const eventType = String(event.event ?? "unknown");
      const data = event.data as { reference?: string; id?: string } | undefined;
      const reference = data?.reference ?? data?.id ?? undefined;

      logger.info("Paystack webhook processed", { eventType, reference });
      return { success: true, eventType, reference };
    } catch (err) {
      logger.error("Paystack processWebhook error", { reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, error: "Failed to process Paystack webhook." };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// FLUTTERWAVE ADAPTER
// ═══════════════════════════════════════════════════════════════

class FlutterwavePaymentAdapter implements FlutterwaveAdapter {
  readonly name = "Flutterwave" as const;
  readonly provider = "flutterwave" as const;
  readonly enabled: boolean;

  constructor() {
    this.enabled = Boolean(env.FLUTTERWAVE_SECRET_KEY);
  }

  async initiatePayment(data: InitiatePaymentRequest): Promise<PaymentResult> {
    if (!this.enabled) {
      return { success: false, error: "Flutterwave is not configured. Set FLUTTERWAVE_SECRET_KEY in environment variables." };
    }

    try {
      const response = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: `fw_${Date.now()}`,
          amount: data.amount,
          currency: data.currency.toUpperCase(),
          email: data.customerEmail ?? "customer@example.com",
          customer_name: data.customerName,
          meta: data.metadata ?? {},
        }),
      });

      const result = await response.json() as {
        status: string;
        message?: string;
        data?: {
          link?: string;
          tx_ref?: string;
          id?: number;
        };
      };

      if (!response.ok || result.status !== "success" || !result.data) {
        const msg = result.message ?? `Flutterwave API returned status ${response.status}`;
        logger.error("Flutterwave initiatePayment failed", { status: response.status, error: msg });
        return { success: false, error: msg };
      }

      return {
        success: true,
        reference: result.data.tx_ref,
        paymentUrl: result.data.link,
      };
    } catch (err) {
      logger.error("Flutterwave initiatePayment error", { reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, error: "Failed to initiate Flutterwave payment." };
    }
  }

  async verifyPayment(reference: string): Promise<VerifyResult> {
    if (!this.enabled) {
      return { success: false, status: "failed", error: "Flutterwave is not configured. Set FLUTTERWAVE_SECRET_KEY in environment variables." };
    }

    try {
      const response = await fetch(
        `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(reference)}/verify`,
        {
          headers: {
            "Authorization": `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
          },
        }
      );

      const result = await response.json() as {
        status: string;
        message?: string;
        data?: {
          status?: string;
          amount?: number;
          currency?: string;
          tx_ref?: string;
        };
      };

      if (!response.ok || result.status !== "success" || !result.data) {
        const msg = result.message ?? `Flutterwave API returned status ${response.status}`;
        logger.error("Flutterwave verifyPayment failed", { reference, status: response.status, error: msg });
        return { success: false, status: "failed", error: msg };
      }

      const txStatus = result.data.status === "successful" ? "success" : result.data.status === "pending" ? "pending" : "failed";

      return {
        success: txStatus === "success",
        amount: result.data.amount,
        currency: result.data.currency,
        status: txStatus,
      };
    } catch (err) {
      logger.error("Flutterwave verifyPayment error", { reference, reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, status: "failed", error: "Failed to verify Flutterwave payment." };
    }
  }

  async processWebhook(payload: unknown, signature: string): Promise<WebhookResult> {
    if (!this.enabled) {
      return { success: false, error: "Flutterwave is not configured. Set FLUTTERWAVE_SECRET_KEY in environment variables." };
    }

    if (!env.FLUTTERWAVE_WEBHOOK_SECRET) {
      return { success: false, error: "Flutterwave webhook secret is not configured. Set FLUTTERWAVE_WEBHOOK_SECRET in environment variables." };
    }

    try {
      // Verify the Flutterwave webhook signature (SHA-512)

      const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
      const expectedSig = crypto
        .createHash("sha512")
        .update(rawBody + env.FLUTTERWAVE_WEBHOOK_SECRET)
        .digest("hex");

      if (expectedSig !== signature) {
        return { success: false, error: "Flutterwave webhook signature verification failed." };
      }

      const event = typeof payload === "string" ? JSON.parse(payload) : (payload as Record<string, unknown>);
      const eventType = String(event["event.type"] ?? event.event ?? "unknown");
      const data = event.data as { tx_ref?: string; id?: number; transaction_id?: number } | undefined;
      const reference = data?.tx_ref ?? (data?.id ? String(data.id) : undefined) ?? (data?.transaction_id ? String(data.transaction_id) : undefined);

      logger.info("Flutterwave webhook processed", { eventType, reference });
      return { success: true, eventType, reference };
    } catch (err) {
      logger.error("Flutterwave processWebhook error", { reason: err instanceof Error ? err.message : "Unknown" });
      return { success: false, error: "Failed to process Flutterwave webhook." };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON INSTANCES & ACCESSORS
// ═══════════════════════════════════════════════════════════════

let _stripe: StripePaymentAdapter | null = null;
let _paystack: PaystackPaymentAdapter | null = null;
let _flutterwave: FlutterwavePaymentAdapter | null = null;

function stripeInstance(): StripePaymentAdapter {
  if (!_stripe) _stripe = new StripePaymentAdapter();
  return _stripe;
}

function paystackInstance(): PaystackPaymentAdapter {
  if (!_paystack) _paystack = new PaystackPaymentAdapter();
  return _paystack;
}

function flutterwaveInstance(): FlutterwavePaymentAdapter {
  if (!_flutterwave) _flutterwave = new FlutterwavePaymentAdapter();
  return _flutterwave;
}

/**
 * Get a payment adapter by provider name.
 */
export function getPaymentAdapter(provider: PaymentProvider): PaymentAdapter {
  switch (provider) {
    case "stripe":
      return stripeInstance();
    case "paystack":
      return paystackInstance();
    case "flutterwave":
      return flutterwaveInstance();
    case "manual":
      logger.warn("Manual payment provider has no adapter");
      throw new Error("Manual payment provider does not have an adapter");
    default:
      throw new Error(`Unknown payment provider: ${provider}`);
  }
}

/**
 * Get all available payment adapters.
 */
export function getAllPaymentAdapters(): PaymentAdapter[] {
  return [stripeInstance(), paystackInstance(), flutterwaveInstance()];
}
