/**
 * Supa AI — Subscription plans catalog.
 *
 * Single source of truth for plan metadata + entitlement limits. The pricing
 * UI, feature gate, and billing facade all read from here. Provider-specific
 * price/tier IDs are attached via `providerPlanIds` so the same Plan can be
 * resolved against Stripe, Paystack, or Flutterwave without divergence.
 *
 * Prices are in USD cents. Multiply by 100 to convert from displayed dollars.
 *
 * @module @/lib/billing/plans
 */
import type { Plan } from "./types";

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    tier: "free",
    priceMonthly: 0,
    priceYearly: 0,
    currency: "usd",
    features: [
      "50 chat messages / month",
      "1 AI model (GPT-4o mini)",
      "Community support",
      "1 project",
    ],
    limits: { messagesPerMonth: 50, imageGenerationsPerMonth: 0, seats: 1 },
  },
  {
    id: "starter",
    name: "Starter",
    tier: "starter",
    priceMonthly: 1200, // $12
    priceYearly: 11500, // $115 (~20% off)
    currency: "usd",
    features: [
      "2,000 chat messages / month",
      "All standard AI models",
      "Email support",
      "5 projects",
      "Usage analytics",
    ],
    limits: { messagesPerMonth: 2_000, imageGenerationsPerMonth: 25, seats: 1 },
  },
  {
    id: "pro",
    name: "Pro",
    tier: "pro",
    priceMonthly: 2900, // $29
    priceYearly: 27800, // $278
    currency: "usd",
    features: [
      "10,000 chat messages / month",
      "All AI models incl. Claude 3.5 & GPT-4o",
      "Image generation (50/mo)",
      "Priority email support",
      "Unlimited projects",
      "API access",
    ],
    limits: { messagesPerMonth: 10_000, imageGenerationsPerMonth: 50, seats: 3 },
  },
  {
    id: "business",
    name: "Business",
    tier: "business",
    priceMonthly: 7900, // $79
    priceYearly: 75800, // $758
    currency: "usd",
    features: [
      "50,000 chat messages / month",
      "All AI models",
      "Image generation (250/mo)",
      "Business tools (workflows, automations)",
      "Priority support",
      "SSO/SAML",
      "Audit log",
      "10 seats included",
    ],
    limits: { messagesPerMonth: 50_000, imageGenerationsPerMonth: 250, seats: 10 },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tier: "enterprise",
    priceMonthly: -1, // Custom — contact sales.
    priceYearly: -1,
    currency: "usd",
    features: [
      "Unlimited messages (fair-use)",
      "Dedicated infrastructure",
      "Custom model fine-tuning",
      "Dedicated CSM + Slack channel",
      "99.9% uptime SLA",
      "On-prem deployment option",
      "SSO + SCIM provisioning",
    ],
    limits: { messagesPerMonth: Number.MAX_SAFE_INTEGER, imageGenerationsPerMonth: Number.MAX_SAFE_INTEGER, seats: Number.MAX_SAFE_INTEGER },
  },
];

const PLANS_BY_ID: ReadonlyMap<string, Plan> = new Map(
  PLANS.map((p) => [p.id, p]),
);

/** Get a plan by id. Throws when the plan doesn't exist. */
export function getPlan(id: string): Plan {
  const plan = PLANS_BY_ID.get(id);
  if (!plan) {
    throw new Error(`Unknown plan: "${id}". Valid: ${PLANS.map((p) => p.id).join(", ")}.`);
  }
  return plan;
}

/** Get a plan by id, or `null` when missing (non-throwing variant). */
export function findPlan(id: string): Plan | null {
  return PLANS_BY_ID.get(id) ?? null;
}

/** The plan new orgs start on. */
export function getDefaultPlan(): Plan {
  return getPlan("free");
}

/** Compare a candidate plan's tier against a baseline; returns -1, 0, 1. */
export function compareTiers(a: Plan["tier"], b: Plan["tier"]): number {
  const order: Plan["tier"][] = ["free", "starter", "pro", "business", "enterprise"];
  return order.indexOf(a) - order.indexOf(b);
}
