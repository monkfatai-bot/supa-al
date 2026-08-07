/**
 * Supa AI — Billing domain types.
 *
 * Provider-agnostic shapes for subscriptions, checkout, customers, and
 * webhook events. Every concrete billing provider (Stripe, Paystack,
 * Flutterwave) maps its native API to these types.
 *
 * @module @/lib/billing/types
 */

/** Supported payment provider identifiers. */
export type PaymentProvider = "stripe" | "paystack" | "flutterwave";

/** Subscription lifecycle states (normalized across providers). */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "paused"
  | "unknown";

/** Plan tier — used by the feature gate to decide entitlements. */
export type PlanTier =
  | "free"
  | "starter"
  | "pro"
  | "business"
  | "enterprise";

/** Recurring plan offered to customers. */
export interface Plan {
  id: string;
  name: string;
  tier: PlanTier;
  /** Price in minor units (cents) per month. 0 for free. */
  priceMonthly: number;
  /** Price in minor units (cents) per year. */
  priceYearly: number;
  /** ISO currency code (lowercase). */
  currency: string;
  /** Human-readable feature list (shown in pricing UI). */
  features: string[];
  /** Provider-specific price/tier IDs (lookup keys), keyed by provider. */
  providerPlanIds?: Partial<Record<PaymentProvider, string>>;
  /** Soft flags used by the feature gate. */
  limits: {
    messagesPerMonth: number;
    imageGenerationsPerMonth: number;
    seats: number;
  };
}

/** Normalized subscription record. */
export interface Subscription {
  id: string;
  orgId: string;
  provider: PaymentProvider;
  /** Provider-issued subscription id (e.g. `sub_xxx` for Stripe). */
  providerSubscriptionId: string;
  status: SubscriptionStatus;
  /** Epoch ms; null when unknown / not applicable. */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  planId?: string;
}

/** Checkout session returned to the client. */
export interface CheckoutSession {
  provider: PaymentProvider;
  /** Provider-issued session id (for reconciliation). */
  sessionId: string;
  /** URL the client should redirect to. */
  url: string;
}

/** Customer record at the provider. */
export interface Customer {
  provider: PaymentProvider;
  providerCustomerId: string;
  email: string;
}

/** Normalized webhook event from any provider. */
export interface WebhookEvent {
  provider: PaymentProvider;
  /** Normalized event type (e.g. `subscription.created`). */
  type: string;
  /** Provider-issued event id (idempotency). */
  eventId?: string;
  /** Raw payload (provider-specific) for handlers that need the full shape. */
  raw: unknown;
  /** Whether the webhook signature verified. */
  signatureValid: boolean;
}

/** Input for `createCheckoutSession`. */
export interface CheckoutInput {
  orgId: string;
  planId: string;
  /** Customer email (for receipt + provider customer record). */
  email: string;
  /** Billing cycle. */
  interval: "monthly" | "yearly";
  /** Optional coupon/promo code. */
  couponCode?: string;
  /** Trial days (provider-dependent). */
  trialDays?: number;
  /** Origin URL for success/cancel redirects. */
  successUrl: string;
  cancelUrl: string;
}
