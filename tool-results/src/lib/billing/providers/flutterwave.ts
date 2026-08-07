/**
 * Supa AI — Flutterwave billing provider.
 *
 * Uses `fetch` against `https://api.flutterwave.com/v3`.
 * Authorization: `Bearer ${secretKey}`.
 *
 * Webhook signature: Flutterwave v3 sends a `verif-hash` header containing
 * the raw webhook secret. We compare in constant time. (Yes — this is
 * Flutterwave's documented mechanism; it's weaker than HMAC but we follow
 * the provider's spec.)
 *
 * Server-only.
 *
 * @module @/lib/billing/providers/flutterwave
 */
import { env } from "@/lib/config/env";
import { ExternalServiceError, PaymentError } from "@/lib/errors";
import { logger } from "@/lib/logger";

import { constantTimeEqual } from "@/lib/security/crypto";
import type { BillingProvider } from "../provider";
import type {
  CheckoutInput,
  CheckoutSession,
  Customer,
  Subscription,
  SubscriptionStatus,
  WebhookEvent,
} from "../types";

const API_BASE = "https://api.flutterwave.com/v3";

interface FlutterwaveResponse<T> {
  status: string; // "success" | "error"
  message: string;
  data: T;
}

interface FlutterwavePaymentPlan {
  id: number;
  name: string;
  amount: number;
  interval: string;
  status: string; // "active" | "cancelled" | ...
  created_at: string;
}

interface FlutterwaveSubscription {
  id: number;
  customer: { id: number; email: string; customer_code?: string };
  plan: number;
  status: string;
  next_payment_date: string | null;
  cancelled_at: string | null;
}

export class FlutterwaveProvider implements BillingProvider {
  readonly id = "flutterwave" as const;

  protected get secretKey(): string {
    return env.payments.flutterwave.secretKey;
  }

  protected get webhookSecret(): string {
    return env.payments.flutterwave.webhookSecret;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.secretKey) {
      throw new PaymentError("FLUTTERWAVE_SECRET_KEY is not set.");
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
        throw new ExternalServiceError("Flutterwave returned non-JSON.", {
          status: res.status,
          body: text.slice(0, 256),
        });
      }
      if (!res.ok) {
        const msg =
          (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
        throw new PaymentError(`Flutterwave error: ${msg}`, {
          provider: this.id,
          status: res.status,
          cause: String(json),
        });
      }
      const wrapper = json as FlutterwaveResponse<T>;
      if (wrapper.status !== "success") {
        throw new PaymentError(`Flutterwave error: ${wrapper.message}`, {
          provider: this.id,
          cause: String(json),
        });
      }
      return wrapper.data;
    } catch (err) {
      if (err instanceof PaymentError || err instanceof ExternalServiceError) {
        throw err;
      }
      throw new PaymentError(`Flutterwave request failed: ${String(err)}`, {
        provider: this.id,
      });
    }
  }

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
    try {
      // Flutterwave: create a payment plan, then build a checkout URL the
      // frontend can redirect to. The plan id becomes the reference.
      const plan = await this.api<FlutterwavePaymentPlan>("/payment-plans", {
        method: "POST",
        body: JSON.stringify({
          amount: 0, // Amount is implied by the plan; the operator pre-creates plans.
          name: `${input.planId}-${input.interval}`,
          interval: input.interval === "yearly" ? "yearly" : "monthly",
          duration: 0, // 0 = indefinite renewal
        }),
      });
      const reference = `supa-${input.orgId}-${Date.now()}`;
      const url = `${API_BASE}/payment-plan/${plan.id}?ref=${encodeURIComponent(reference)}`;
      return {
        provider: this.id,
        sessionId: String(plan.id),
        url,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "createCheckoutSession" });
    }
  }

  async createCustomer(email: string): Promise<Customer> {
    try {
      const data = await this.api<{ id: number; email: string }>("/customers", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return {
        provider: this.id,
        providerCustomerId: String(data.id),
        email: data.email,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "createCustomer" });
    }
  }

  async getSubscription(id: string): Promise<Subscription> {
    try {
      const data = await this.api<FlutterwaveSubscription>(
        `/subscriptions/${encodeURIComponent(id)}`,
      );
      return this.toSubscription(data);
    } catch (err) {
      throw this.normalizeError(err, { op: "getSubscription", id });
    }
  }

  async cancelSubscription(id: string, _immediately = false): Promise<Subscription> {
    try {
      await this.api<{ status: string }>(
        `/payment-plans/${encodeURIComponent(id)}/cancel`,
        { method: "PUT" },
      );
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
    const signature = headers["verif-hash"];
    if (!signature) {
      return {
        provider: this.id,
        type: "signature.missing",
        raw: null,
        signatureValid: false,
      };
    }
    if (!this.webhookSecret) {
      logger.error("FLUTTERWAVE_WEBHOOK_SECRET not configured; rejecting webhook.");
      return {
        provider: this.id,
        type: "signature.misconfigured",
        raw: null,
        signatureValid: false,
      };
    }
    // Flutterwave sends the raw secret in the header. Constant-time compare.
    if (!constantTimeEqual(signature, this.webhookSecret)) {
      logger.warn("Flutterwave webhook signature mismatch.");
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
    const event = parsed as { event?: string; data?: unknown; id?: string | number } | null;
    return {
      provider: this.id,
      type: event?.event ?? "unknown",
      eventId: event?.id != null ? String(event.id) : undefined,
      raw: event,
      signatureValid: true,
    };
  }

  // --- internals ---------------------------------------------------------

  private toSubscription(sub: FlutterwaveSubscription): Subscription {
    return {
      id: String(sub.id),
      orgId: "",
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
      case "trial": return "trialing";
      default: return "unknown";
    }
  }

  private normalizeError(err: unknown, context: Record<string, unknown>): PaymentError {
    if (err instanceof PaymentError) return err;
    return new PaymentError(`Flutterwave error: ${String(err)}`, {
      provider: this.id,
      ...context,
    });
  }
}
