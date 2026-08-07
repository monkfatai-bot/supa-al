/**
 * Supa AI — Billing provider registry.
 *
 * Mirrors the AI provider registry pattern: lazy-init + cache, throws
 * `ConfigurationError` when the provider's secret key is unset, exposes a
 * list of configured providers for the dashboard.
 *
 * Server-only.
 *
 * @module @/lib/billing/registry
 */
import { env } from "@/lib/config/env";
import { ConfigurationError } from "@/lib/errors";

import type { PaymentProvider } from "./types";
import type { BillingProvider } from "./provider";
import { FlutterwaveProvider } from "./providers/flutterwave";
import { PaystackProvider } from "./providers/paystack";
import { StripeProvider } from "./providers/stripe";

interface BillingRegistration {
  id: PaymentProvider;
  factory: () => BillingProvider;
  isConfigured: () => boolean;
  envVar: string;
}

const REGISTRY: Record<PaymentProvider, BillingRegistration> = {
  stripe: {
    id: "stripe",
    factory: () => new StripeProvider(),
    isConfigured: () => !!env.payments.stripe.secretKey,
    envVar: "STRIPE_SECRET_KEY",
  },
  paystack: {
    id: "paystack",
    factory: () => new PaystackProvider(),
    isConfigured: () => !!env.payments.paystack.secretKey,
    envVar: "PAYSTACK_SECRET_KEY",
  },
  flutterwave: {
    id: "flutterwave",
    factory: () => new FlutterwaveProvider(),
    isConfigured: () => !!env.payments.flutterwave.secretKey,
    envVar: "FLUTTERWAVE_SECRET_KEY",
  },
};

const VALID_PROVIDERS = Object.keys(REGISTRY) as PaymentProvider[];

function isProvider(id: string): id is PaymentProvider {
  return id in REGISTRY;
}

export class BillingProviderRegistry {
  private instances = new Map<PaymentProvider, BillingProvider>();

  get(providerId: string): BillingProvider {
    if (!isProvider(providerId)) {
      throw new ConfigurationError(
        `Unknown payment provider: "${providerId}". Valid: ${VALID_PROVIDERS.join(", ")}.`,
      );
    }
    const reg = REGISTRY[providerId];
    if (!reg.isConfigured()) {
      throw new ConfigurationError(
        `Payment provider "${providerId}" requires ${reg.envVar} to be set.`,
        { provider: providerId, envVar: reg.envVar },
      );
    }
    let instance = this.instances.get(providerId);
    if (!instance) {
      instance = reg.factory();
      this.instances.set(providerId, instance);
    }
    return instance;
  }

  getDefault(): BillingProvider {
    return this.get(env.payments.defaultProvider);
  }

  getDefaultId(): PaymentProvider {
    return isProvider(env.payments.defaultProvider)
      ? env.payments.defaultProvider
      : "stripe";
  }

  listAvailable(): PaymentProvider[] {
    return VALID_PROVIDERS.filter((id) => REGISTRY[id].isConfigured());
  }

  listAll(): PaymentProvider[] {
    return [...VALID_PROVIDERS];
  }
}

/** Shared singleton. */
export const billingRegistry = new BillingProviderRegistry();
