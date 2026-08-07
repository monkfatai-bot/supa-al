/**
 * Supa AI — billing & subscription constants.
 *
 * Catalog of payment providers (Stripe / Paystack / Flutterwave), billing
 * intervals, subscription lifecycle statuses, and the plan-tier metadata
 * rendered on the pricing page. Currency defaults, region support, and
 * feature breakdowns all live here so the billing UI and the webhook
 * handlers stay in lockstep.
 *
 * @module @/lib/constants/billing
 */

/** Supported payment gateway identifiers. */
export type PaymentProviderId = "stripe" | "paystack" | "flutterwave";

/** Subscription billing cadence. */
export type BillingInterval = "month" | "year";

/** Lifecycle status of a subscription. */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

/** Plan tier identifiers, ordered low → high. */
export type PlanTierId =
  | "free"
  | "starter"
  | "pro"
  | "business"
  | "enterprise";

/** Static metadata for a payment provider. */
export interface PaymentProviderInfo {
  id: PaymentProviderId;
  label: string;
  /** ISO-3166 alpha-2 country codes the provider supports, or `["global"]`. */
  supportedRegions: readonly string[];
}

/**
 * Payment gateways the platform integrates with. Render order matters for
 * the checkout provider picker.
 */
export const PAYMENT_PROVIDERS: readonly PaymentProviderInfo[] = [
  {
    id: "stripe",
    label: "Stripe",
    supportedRegions: ["global"],
  },
  {
    id: "paystack",
    label: "Paystack",
    supportedRegions: ["NG", "GH", "KE", "ZA"],
  },
  {
    id: "flutterwave",
    label: "Flutterwave",
    supportedRegions: ["NG", "GH", "KE", "UG", "TZ", "ZA"],
  },
] as const;

/** Default payment provider. Mirrors `env.payments.defaultProvider`. */
export const DEFAULT_PAYMENT_PROVIDER: PaymentProviderId = "stripe";

/** Default ISO-4217 currency code (lowercase). Mirrors `env.payments.currency`. */
export const DEFAULT_CURRENCY = "usd" as const;

/** Allowed billing intervals. */
export const BILLING_INTERVALS = ["month", "year"] as const;

/** Allowed subscription statuses. */
export const SUBSCRIPTION_STATUS = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
] as const;

/** Metadata for a single plan tier. */
export interface PlanTier {
  id: PlanTierId;
  label: string;
  description: string;
  /** Monthly price in USD. `0` for free / contact-sales tiers. */
  monthlyPriceUsd: number;
  /** Annual price in USD. `0` for free / contact-sales tiers. */
  yearlyPriceUsd: number;
  /** Bullet-point feature list shown on the pricing card. */
  features: readonly string[];
  /** When `true`, the tier is rendered as "contact sales" (no fixed price). */
  customPricing?: boolean;
  /** Visually highlight this tier on the pricing page. */
  highlighted?: boolean;
}

/**
 * Plan tiers, ordered low → high. The pricing page iterates this array
 * as-is, so insertion order == visual order.
 */
export const PLAN_TIERS: readonly PlanTier[] = [
  {
    id: "free",
    label: "Free",
    description: "Explore the basics. No credit card required.",
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    features: [
      "10 AI chats / day",
      "1 project",
      "Community support",
    ],
  },
  {
    id: "starter",
    label: "Starter",
    description: "For individual creators getting started.",
    monthlyPriceUsd: 12,
    yearlyPriceUsd: 120,
    features: [
      "100 AI chats / day",
      "10 projects",
      "Image generation (50 / mo)",
      "Email support",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    description: "For power users and freelancers.",
    monthlyPriceUsd: 29,
    yearlyPriceUsd: 290,
    features: [
      "Unlimited AI chats",
      "Unlimited projects",
      "Image generation (1,000 / mo)",
      "Priority support",
    ],
    highlighted: true,
  },
  {
    id: "business",
    label: "Business",
    description: "For growing teams that need collaboration.",
    monthlyPriceUsd: 99,
    yearlyPriceUsd: 990,
    features: [
      "Everything in Pro",
      "5 team seats included",
      "Marketplace publishing",
      "Business tool workflows",
      "SSO (SAML)",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    description: "Custom contracts, security, and support.",
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    features: [
      "Custom seat count",
      "Dedicated SLA + CSM",
      "On-prem / VPC deployment",
      "Audit logs + DPA",
    ],
    customPricing: true,
  },
] as const;

/**
 * Find a plan tier by id. Returns `undefined` when not found.
 */
export function getPlanTier(id: PlanTierId): PlanTier | undefined {
  return PLAN_TIERS.find((tier) => tier.id === id);
}
