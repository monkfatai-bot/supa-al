/**
 * Supa AI — Billing provider contract.
 *
 * Every concrete provider (Stripe, Paystack, Flutterwave) implements this.
 * The facade relies on this interface (never on concrete classes) so we can
 * swap providers without touching call sites.
 *
 * Server-only.
 *
 * @module @/lib/billing/provider
 */
import type {
  CheckoutInput,
  CheckoutSession,
  Customer,
  PaymentProvider,
  Subscription,
  WebhookEvent,
} from "./types";

export interface BillingProvider {
  readonly id: PaymentProvider;
  /** Create a checkout session for a plan subscription. */
  createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession>;
  /** Create (or look up) a customer at the provider by email. */
  createCustomer(email: string): Promise<Customer>;
  /** Fetch a subscription by its provider-issued id. */
  getSubscription(id: string): Promise<Subscription>;
  /** Cancel a subscription (at period end by default). */
  cancelSubscription(id: string, immediately?: boolean): Promise<Subscription>;
  /**
   * Verify + parse a webhook payload. MUST validate the signature before
   * returning `signatureValid: true`.
   */
  constructWebhookEvent(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent>;
}

export type { BillingProvider as IBillingProvider };
