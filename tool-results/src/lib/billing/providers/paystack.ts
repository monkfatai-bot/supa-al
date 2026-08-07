/**
 * Supa AI — Paystack billing provider.
 *
 * Paystack has no official Node SDK — we use typed `fetch` against
 * `https://api.paystack.co`. Authorization: `Bearer ${secretKey}`.
 *
 * Webhook signature is HMAC SHA512 of the raw body using the webhook secret,
 * sent in the `x-paystack-signature` header.
 *
 * Server-only.
 *
 * @module @/lib/billing/providers/paystack
 */
import crypto from "node:crypto";

import { env } from "@/lib/config/env";
import { ExternalServiceError, PaymentError } from "@/lib/errors";
import { logger } from "@/lib/logger";

import type { BillingProvider } from "../provider";
import type {
  CheckoutInput,
  CheckoutSession,
  Customer,
  Subscription,
  SubscriptionStatus,
  WebhookEvent,
} from "../types";

const API_BASE = "https://api.paystack.co";

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

interface PaystackSubscription {
  id: number;
  status: string; // "active" | "cancelled" | "completed" | "non-renewing" | ...
  customer: { id: number; email: string; customer_code: string };
  plan: { id: number; name: string; plan_code: string; interval: string };
  next_payment_date: string | null;
  cancelled_at: string | null;
}

interface PaystackCustomer {
  id: number;
  email: string;
  customer_code: string;
}

export class PaystackProvider implements BillingProvider {
  readonly id = "paystack" as const;

  protected get secretKey(): string {
    return env.payments.paystack.secretKey;
  }

  protected get webhookSecret(): string {
    return env.payments.paystack.webhookSecret;
  }

  private async api<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!this.secretKey) {
      throw new PaymentError("PAYSTACK_SECRET_KEY is not set.");
    }
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new ExternalServiceError("Paystack returned non-JSON.", {
          status: res.status,
          body: text.slice(0, 256),
        });
      }
      if (!res.ok) {
        const msg =
          (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
        throw new PaymentError(`Paystack error: ${msg}`, {
          provider: this.id,
          status: res.status,
          cause: String(json),
        });
      }
      const wrapper = json as PaystackResponse<T>;
      if (!wrapper.status) {
        throw new PaymentError(`Paystack error: ${wrapper.message}`, {
          provider: this.id,
          cause: String(json),
        });
      }
      return wrapper.data;
    } catch (err) {
      if (err instanceof PaymentError || err instanceof ExternalServiceError) {
        throw err;
      }
      throw new PaymentError(`Paystack request failed: ${String(err)}`, {
        provider: this.id,
      });
    }
  }

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
    // Paystack's flow is one-shot for a transaction. For subscriptions we
    // initialize a transaction with the plan code; Paystack will create the
    // subscription after the user authorizes.
    try {
      const data = await this.api<{
        authorization_url: string;
        access_code: string;
        reference: string;
      }>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          plan: input.planId,
          callback_url: input.successUrl,
          metadata: {
            orgId: input.orgId,
            planId: input.planId,
            interval: input.interval,
            cancel_url: input.cancelUrl,
          },
        }),
      });
      return {
        provider: this.id,
        sessionId: data.reference,
        url: data.authorization_url,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "createCheckoutSession" });
    }
  }

  async createCustomer(email: string): Promise<Customer> {
    try {
      const data = await this.api<PaystackCustomer>("/customer", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return {
        provider: this.id,
        providerCustomerId: data.customer_code,
        email: data.email,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "createCustomer" });
    }
  }

  async getSubscription(id: string): Promise<Subscription> {
    try {
      const data = await this.api<PaystackSubscription>(
        `/subscription/${encodeURIComponent(id)}`,
      );
      return this.toSubscription(data, input_orgId(data));
    } catch (err) {
      throw this.normalizeError(err, { op: "getSubscription", id });
    }
  }

  async cancelSubscription(id: string, _immediately = false): Promise<Subscription> {
    try {
      // Paystack disables the subscription; "immediately" is the only mode.
      await this.api<{ status: boolean }>("/subscription/disable", {
        method: "POST",
        body: JSON.stringify({ code: id, token: id }),
      });
      return {
        id,
        orgId: "",
        provider: this.id,
        providerSubscriptionId: id,
        status: "canceled",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: true,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "cancelSubscription", id });
    }
  }

  async constructWebhookEvent(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    const signature = headers["x-paystack-signature"];
    if (!signature) {
      return {
        provider: this.id,
        type: "signature.missing",
        raw: null,
        signatureValid: false,
      };
    }
    if (!this.webhookSecret) {
      logger.error("PAYSTACK_WEBHOOK_SECRET not configured; rejecting webhook.");
      return {
        provider: this.id,
        type: "signature.misconfigured",
        raw: null,
        signatureValid: false,
      };
    }
    const expected = crypto
      .createHmac("sha512", this.webhookSecret)
      .update(body, "utf8")
      .digest("hex");
    let valid = false;
    try {
      valid =
        expected.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      valid = false;
    }
    if (!valid) {
      logger.warn("Paystack webhook signature mismatch.");
      return {
        provider: this.id,
        type: "signature.invalid",
        raw: null,
        signatureValid: false,
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    const event = parsed as { event?: string; data?: unknown; id?: number } | null;
    return {
      provider: this.id,
      type: event?.event ?? "unknown",
      eventId: event?.id != null ? String(event.id) : undefined,
      raw: event,
      signatureValid: true,
    };
  }

  // --- internals ---------------------------------------------------------

  private toSubscription(
    sub: PaystackSubscription,
    orgId: string,
  ): Subscription {
    return {
      id: String(sub.id),
      orgId,
      provider: this.id,
      providerSubscriptionId: String(sub.id),
      status: this.mapStatus(sub.status),
      currentPeriodEnd: sub.next_payment_date
        ? Date.parse(sub.next_payment_date)
        : null,
      cancelAtPeriodEnd: sub.cancelled_at != null,
    };
  }

  private mapStatus(status: string): SubscriptionStatus {
    switch (status) {
      case "active": return "active";
      case "cancelled": return "canceled";
      case "completed": return "active";
      case "non-renewing": return "active";
      case "trial": return "trialing";
      default: return "unknown";
    }
  }

  private normalizeError(err: unknown, context: Record<string, unknown>): PaymentError {
    if (err instanceof PaymentError) return err;
    return new PaymentError(`Paystack error: ${String(err)}`, {
      provider: this.id,
      ...context,
    });
  }
}

/** Paystack's subscription object doesn't carry our orgId directly; we set it via metadata on the transaction. Best-effort extraction. */
function input_orgId(_sub: PaystackSubscription): string {
  // The customer/transaction metadata is not on the subscription object.
  // In Phase 1 we leave this empty — the webhook handler in the facade will
  // hydrate it from the metadata of the originating transaction.
  return "";
}
