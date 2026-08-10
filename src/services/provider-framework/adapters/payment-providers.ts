/**
 * Payment Provider Adapters
 *
 * Production adapters for Stripe, Paystack, and Flutterwave.
 * Each validates credentials and makes real API calls.
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderResult,
  ProviderHealthResult,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

async function apiCall(
  _name: string,
  url: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: unknown; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, latencyMs, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, data, latencyMs };
  } catch (err) {
    return { ok: false, latencyMs: Math.round(performance.now() - start), error: err instanceof Error ? err.message : String(err) };
  }
}

// ═══════════════════════════════════════════════════════════════
// STRIPE
// ═══════════════════════════════════════════════════════════════

export const stripeProviderAdapter: ProviderAdapter = {
  id: "stripe",
  name: "Stripe",
  category: "payment",
  capabilities: ["create_charge", "create_invoice", "manage_subscriptions", "webhook", "refund", "verify_payment"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const apiKey = (config.credentials?.apiKey as string) ?? env.STRIPE_SECRET_KEY;
    if (!apiKey) throw new Error("Stripe secret key is required.");
    const result = await apiCall("Stripe", "https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!result.ok) throw new Error(`Stripe auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const apiKey = (params.apiKey as string) ?? env.STRIPE_SECRET_KEY;
    if (!apiKey) return { success: false, error: "Stripe secret key is required." };
    try {
      switch (action) {
        case "create_charge": {
          const body = new URLSearchParams({
            amount: String(Math.round((params.amount as number) * 100)),
            currency: (params.currency as string) ?? "usd",
            source: params.source as string,
            description: (params.description as string) ?? "",
          });
          const res = await fetch("https://api.stripe.com/v1/charges", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body,
          });
          const data = await res.json().catch(() => null);
          return res.ok ? { success: true, data } : { success: false, error: `Stripe error: ${data?.error?.message ?? res.status}` };
        }
        case "create_invoice": {
          const body = new URLSearchParams({
            customer: params.customerId as string,
            amount: String(Math.round((params.amount as number) * 100)),
            currency: (params.currency as string) ?? "usd",
            description: (params.description as string) ?? "",
          });
          const res = await fetch("https://api.stripe.com/v1/invoices", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body,
          });
          const data = await res.json().catch(() => null);
          return res.ok ? { success: true, data } : { success: false, error: `Stripe error: ${data?.error?.message ?? res.status}` };
        }
        case "verify_payment": {
          const res = await fetch(`https://api.stripe.com/v1/charges/${params.paymentIntentId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          const data = await res.json().catch(() => null);
          return res.ok ? { success: true, data } : { success: false, error: `Stripe error: ${data?.error?.message ?? res.status}` };
        }
        default:
          return { success: false, error: `Unsupported Stripe action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Stripe provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    if (!env.STRIPE_SECRET_KEY) return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Stripe key not configured", lastChecked: new Date().toISOString() };
    const result = await apiCall("Stripe", "https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
    return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// PAYSTACK
// ═══════════════════════════════════════════════════════════════

export const paystackProviderAdapter: ProviderAdapter = {
  id: "paystack",
  name: "Paystack",
  category: "payment",
  capabilities: ["initialize_payment", "verify_payment", "charge_authorization", "create_customer", "webhook"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const apiKey = (config.credentials?.apiKey as string) ?? env.PAYSTACK_SECRET_KEY;
    if (!apiKey) throw new Error("Paystack secret key is required.");
    const result = await apiCall("Paystack", "https://api.paystack.co/transaction/verify/0", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    // 404 is expected for a fake reference — any auth error would be 401
    if (result.error && !result.error.includes("404")) throw new Error(`Paystack auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const apiKey = (params.apiKey as string) ?? env.PAYSTACK_SECRET_KEY;
    if (!apiKey) return { success: false, error: "Paystack secret key is required." };
    try {
      switch (action) {
        case "initialize_payment": {
          const res = await apiCall("Paystack", "https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ email: params.email, amount: Math.round((params.amount as number) * 100), currency: (params.currency as string) ?? "NGN" }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "verify_payment": {
          const res = await apiCall("Paystack", `https://api.paystack.co/transaction/verify/${params.reference}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Paystack action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Paystack provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    if (!env.PAYSTACK_SECRET_KEY) return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Paystack key not configured", lastChecked: new Date().toISOString() };
    const result = await apiCall("Paystack", "https://api.paystack.co/bank", { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } });
    return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// FLUTTERWAVE
// ═══════════════════════════════════════════════════════════════

export const flutterwaveProviderAdapter: ProviderAdapter = {
  id: "flutterwave",
  name: "Flutterwave",
  category: "payment",
  capabilities: ["initialize_payment", "verify_payment", "create_subscription", "charge_tokenized_card", "webhook"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const apiKey = (config.credentials?.apiKey as string) ?? env.FLUTTERWAVE_SECRET_KEY;
    if (!apiKey) throw new Error("Flutterwave secret key is required.");
    const result = await apiCall("Flutterwave", "https://api.flutterwave.com/v3/transactions", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (result.error && !result.error.includes("200")) throw new Error(`Flutterwave auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const apiKey = (params.apiKey as string) ?? env.FLUTTERWAVE_SECRET_KEY;
    if (!apiKey) return { success: false, error: "Flutterwave secret key is required." };
    try {
      switch (action) {
        case "initialize_payment": {
          const res = await apiCall("Flutterwave", "https://api.flutterwave.com/v3/payments", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ tx_ref: params.txRef, amount: params.amount, currency: (params.currency as string) ?? "NGN", redirect_url: params.redirectUrl, customer: { email: params.email, name: params.name } }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "verify_payment": {
          const res = await apiCall("Flutterwave", `https://api.flutterwave.com/v3/transactions/${params.transactionId}/verify`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Flutterwave action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Flutterwave provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    if (!env.FLUTTERWAVE_SECRET_KEY) return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Flutterwave key not configured", lastChecked: new Date().toISOString() };
    const result = await apiCall("Flutterwave", "https://api.flutterwave.com/v3/banks/NG", { headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` } });
    return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};
