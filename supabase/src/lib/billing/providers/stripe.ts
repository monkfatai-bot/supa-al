/**
 * Supa AI — Stripe billing provider.
 *
 * Uses the official `stripe` server SDK. Webhook signature verification uses
 * `env.payments.stripe.webhookSecret`.
 *
 * Server-only.
 *
 * @module @/lib/billing/providers/stripe
 */
import Stripe from "stripe";

import { env } from "@/lib/config/env";
import { PaymentError } from "@/lib/errors";
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

export class StripeProvider implements BillingProvider {
  readonly id = "stripe" as const;

  private client: Stripe | null = null;

  protected getClient(): Stripe {
    if (this.client) return this.client;
    if (!env.payments.stripe.secretKey) {
      throw new PaymentError("STRIPE_SECRET_KEY is not set.");
    }
    this.client = new Stripe(env.payments.stripe.secretKey, {
      // Pin to the version paired with our SDK install; `null` would let Stripe
      // pick the account default, which is better in production but harder to
      // test deterministically. The SDK exposes the supported version literal.
      apiVersion: null as unknown as Stripe.LatestApiVersion,
      maxNetworkRetries: 2,
      timeout: 30_000,
    });
    return this.client;
  }

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
    const client = this.getClient();
    try {
      // Look up the price by the plan's lookup key (stored on the Plan).
      const session = await client.checkout.sessions.create({
        mode: "subscription",
        customer_email: input.email,
        line_items: [{ price: input.planId, quantity: 1 }],
        subscription_data: {
          metadata: { orgId: input.orgId, planId: input.planId },
          trial_period_days: input.trialDays,
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { orgId: input.orgId, planId: input.planId },
      });
      if (!session.url || !session.id) {
        throw new PaymentError("Stripe checkout session missing URL/id.", {
          sessionId: session.id,
        });
      }
      return {
        provider: this.id,
        sessionId: session.id,
        url: session.url,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "createCheckoutSession" });
    }
  }

  async createCustomer(email: string): Promise<Customer> {
    const client = this.getClient();
    try {
      const customer = await client.customers.create({ email });
      return {
        provider: this.id,
        providerCustomerId: customer.id,
        email: customer.email ?? email,
      };
    } catch (err) {
      throw this.normalizeError(err, { op: "createCustomer" });
    }
  }

  async getSubscription(id: string): Promise<Subscription> {
    const client = this.getClient();
    try {
      const sub = await client.subscriptions.retrieve(id);
      return this.toSubscription(sub);
    } catch (err) {
      throw this.normalizeError(err, { op: "getSubscription", id });
    }
  }

  async cancelSubscription(id: string, immediately = false): Promise<Subscription> {
    const client = this.getClient();
    try {
      const sub = immediately
        ? await client.subscriptions.cancel(id)
        : await client.subscriptions.update(id, { cancel_at_period_end: true });
      return this.toSubscription(sub);
    } catch (err) {
      throw this.normalizeError(err, { op: "cancelSubscription", id });
    }
  }

  async constructWebhookEvent(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    const client = this.getClient();
    const signature = headers["stripe-signature"] ?? headers["Stripe-Signature"];
    if (!signature) {
      return {
        provider: this.id,
        type: "signature.missing",
        raw: null,
        signatureValid: false,
      };
    }
    if (!env.payments.stripe.webhookSecret) {
      logger.error("STRIPE_WEBHOOK_SECRET not configured; rejecting webhook.");
      return {
        provider: this.id,
        type: "signature.misconfigured",
        raw: null,
        signatureValid: false,
      };
    }
    try {
      const event = client.webhooks.constructEvent(
        body,
        signature,
        env.payments.stripe.webhookSecret,
      );
      return {
        provider: this.id,
        type: this.normalizeEventType(event.type),
        eventId: event.id,
        raw: event,
        signatureValid: true,
      };
    } catch (err) {
      logger.warn("Stripe webhook signature verification failed.", {
        error: String(err),
      });
      return {
        provider: this.id,
        type: "signature.invalid",
        raw: null,
        signatureValid: false,
      };
    }
  }

  // --- internals ---------------------------------------------------------

  private toSubscription(sub: Stripe.Subscription): Subscription {
    return {
      id: sub.id,
      orgId: (sub.metadata?.orgId as string | undefined) ?? "",
      provider: this.id,
      providerSubscriptionId: sub.id,
      status: this.mapStatus(sub.status),
      currentPeriodEnd:
        typeof sub.current_period_end === "number"
          ? sub.current_period_end * 1000
          : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      planId: (sub.metadata?.planId as string | undefined) ?? undefined,
    };
  }

  private mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    switch (status) {
      case "active": return "active";
      case "trialing": return "trialing";
      case "past_due": return "past_due";
      case "canceled": return "canceled";
      case "incomplete":
      case "incomplete_expired": return "incomplete";
      case "paused": return "paused";
      default: return "unknown";
    }
  }

  /** Map Stripe event types to our normalized vocabulary. */
  private normalizeEventType(stripeType: string): string {
    return stripeType;
  }

  private normalizeError(err: unknown, context: Record<string, unknown>): PaymentError {
    if (err instanceof PaymentError) return err;
    const sdkErr = err as { type?: string; message?: string; statusCode?: number };
    const message = sdkErr?.message ?? "Stripe API error.";
    return new PaymentError(message, {
      provider: this.id,
      type: sdkErr?.type,
      statusCode: sdkErr?.statusCode,
      ...context,
      cause: String(err),
    });
  }
}
