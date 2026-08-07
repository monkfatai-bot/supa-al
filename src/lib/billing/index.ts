/**
 * Supa AI — Billing facade.
 *
 * Single entry point for application code. Picks the configured default
 * provider (or one explicitly requested), dispatches webhooks after signature
 * verification, and exposes the plan catalog.
 *
 * Server-only.
 *
 * @module @/lib/billing
 */
import { logger } from "@/lib/logger";

import { BillingProviderRegistry, billingRegistry } from "./registry";
import type { BillingProvider } from "./provider";
import { PLANS, compareTiers, findPlan, getDefaultPlan, getPlan } from "./plans";
import {
  currentMonthPeriod,
  getUsage,
  recordUsage,
  setUsageRecorder,
  type BillingUsageRecord,
  type UsageRecorder,
  type UsageSummary,
} from "./usage";

export type {
  BillingProvider,
} from "./provider";
export type {
  CheckoutInput,
  CheckoutSession,
  Customer,
  PaymentProvider,
  Plan,
  PlanTier,
  Subscription,
  SubscriptionStatus,
  WebhookEvent,
} from "./types";
export { BillingProviderRegistry, billingRegistry } from "./registry";
export { PLANS, compareTiers, findPlan, getDefaultPlan, getPlan } from "./plans";
export {
  currentMonthPeriod,
  getUsage,
  recordUsage,
  setUsageRecorder,
  type BillingUsageRecord,
  type UsageRecorder,
  type UsageSummary,
} from "./usage";

/** Pluggable webhook handler. Set by the orchestration layer (e.g. Supabase writes). */
export type WebhookHandler = (event: WebhookEvent) => void | Promise<void>;

import type { WebhookEvent } from "./types";
import type { CheckoutInput, CheckoutSession, Subscription } from "./types";

interface BillingFacade {
  /** Create a checkout session for a plan. */
  createCheckout(
    orgId: string,
    planId: string,
    opts: Omit<CheckoutInput, "orgId" | "planId">,
  ): Promise<CheckoutSession>;
  /** Cancel a subscription (default: at period end). */
  cancel(subscriptionId: string, immediately?: boolean): Promise<Subscription>;
  /** Fetch a subscription by id (uses default provider unless id encodes one). */
  getSubscription(subscriptionId: string): Promise<Subscription>;
  /** Resolve the configured default provider. */
  getDefaultProvider(): BillingProvider;
  /** List providers that have their secret key configured. */
  listAvailableProviders(): ReturnType<BillingProviderRegistry["listAvailable"]>;
  /** Verify + dispatch a webhook payload. */
  handleWebhook(
    providerId: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent>;
  /** Plug in a webhook handler (post-verification). */
  setWebhookHandler(handler: WebhookHandler | null): void;
}

class BillingFacadeImpl implements BillingFacade {
  private webhookHandler: WebhookHandler | null = null;

  setWebhookHandler(handler: WebhookHandler | null): void {
    this.webhookHandler = handler;
  }

  getDefaultProvider(): BillingProvider {
    return billingRegistry.getDefault();
  }

  listAvailableProviders() {
    return billingRegistry.listAvailable();
  }

  async createCheckout(
    orgId: string,
    planId: string,
    opts: Omit<CheckoutInput, "orgId" | "planId">,
  ): Promise<CheckoutSession> {
    // Validate plan id (fail fast — caller can't start checkout for unknown plan).
    const plan = getPlan(planId);
    if (plan.tier === "free") {
      // No checkout needed; caller should just attach the plan directly.
      throw new Error("Free plan does not require checkout.");
    }
    // Pick a provider-specific price id if attached; otherwise pass the plan id.
    const providerId = billingRegistry.getDefaultId();
    const provider = billingRegistry.get(providerId);
    const providerPlanId = plan.providerPlanIds?.[providerId] ?? plan.id;
    return provider.createCheckoutSession({
      orgId,
      planId: providerPlanId,
      ...opts,
    });
  }

  async cancel(subscriptionId: string, immediately = false): Promise<Subscription> {
    return this.getDefaultProvider().cancelSubscription(subscriptionId, immediately);
  }

  async getSubscription(subscriptionId: string): Promise<Subscription> {
    return this.getDefaultProvider().getSubscription(subscriptionId);
  }

  async handleWebhook(
    providerId: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    const provider = billingRegistry.get(providerId);
    const event = await provider.constructWebhookEvent(headers, body);
    if (!event.signatureValid) {
      logger.warn("Webhook signature invalid; not dispatching.", {
        provider: providerId,
        type: event.type,
      });
      return event;
    }
    if (this.webhookHandler) {
      try {
        await this.webhookHandler(event);
      } catch (err) {
        // Handler errors must not break the webhook ack — providers retry on non-2xx,
        // and we'd rather dedupe than drop. Log loudly.
        logger.error("Webhook handler threw; acking anyway.", {
          provider: providerId,
          type: event.type,
          error: String(err),
        });
      }
    } else {
      logger.warn("Webhook received but no handler is plugged in.", {
        provider: providerId,
        type: event.type,
      });
    }
    return event;
  }
}

/** Top-level facade used across the app. */
export const billing: BillingFacade = new BillingFacadeImpl();
