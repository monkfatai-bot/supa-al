/**
 * Commerce Provider Adapters
 *
 * Production adapters for Shopify and WooCommerce.
 * Both use OAuth/API key authentication with real API calls.
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderResult,
  ProviderHealthResult,
} from "../types";
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
// SHOPIFY
// ═══════════════════════════════════════════════════════════════

export const shopifyProviderAdapter: ProviderAdapter = {
  id: "shopify",
  name: "Shopify",
  category: "commerce",
  capabilities: ["list_products", "create_order", "read_customers", "manage_inventory", "webhook"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const token = config.credentials?.accessToken as string | undefined;
    const storeDomain = config.credentials?.storeDomain as string | undefined;
    if (!token || !storeDomain) throw new Error("Shopify requires store domain and OAuth token.");
    const result = await apiCall("Shopify", `https://${storeDomain}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    if (!result.ok) throw new Error(`Shopify auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const token = params.accessToken as string;
    const storeDomain = params.storeDomain as string;
    if (!token || !storeDomain) return { success: false, error: "Shopify credentials are required." };
    const baseUrl = `https://${storeDomain}/admin/api/2024-01`;
    try {
      switch (action) {
        case "list_products": {
          const res = await apiCall("Shopify", `${baseUrl}/products.json?limit=${params.limit ?? 50}`, {
            headers: { "X-Shopify-Access-Token": token },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "create_order": {
          const res = await apiCall("Shopify", `${baseUrl}/orders.json`, {
            method: "POST",
            headers: { "X-Shopify-Access-Token": token },
            body: JSON.stringify({ order: params.order }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "read_customers": {
          const res = await apiCall("Shopify", `${baseUrl}/customers.json?limit=${params.limit ?? 50}`, {
            headers: { "X-Shopify-Access-Token": token },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Shopify action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Shopify provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Shopify requires OAuth configuration.", lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// WOOCOMMERCE
// ═══════════════════════════════════════════════════════════════

export const woocommerceProviderAdapter: ProviderAdapter = {
  id: "woocommerce",
  name: "WooCommerce",
  category: "commerce",
  capabilities: ["list_products", "create_order", "read_customers", "manage_inventory", "webhook"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const consumerKey = config.credentials?.consumerKey as string | undefined;
    const consumerSecret = config.credentials?.consumerSecret as string | undefined;
    const siteUrl = config.credentials?.siteUrl as string | undefined;
    if (!consumerKey || !consumerSecret || !siteUrl) throw new Error("WooCommerce requires site URL, consumer key, and secret.");
    const result = await apiCall("WooCommerce", `${siteUrl}/wp-json/wc/v3/products`, {
      headers: { Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}` },
    });
    if (!result.ok) throw new Error(`WooCommerce auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const consumerKey = params.consumerKey as string;
    const consumerSecret = params.consumerSecret as string;
    const siteUrl = params.siteUrl as string;
    if (!consumerKey || !consumerSecret || !siteUrl) return { success: false, error: "WooCommerce credentials are required." };
    const auth = `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`;
    const baseUrl = `${siteUrl}/wp-json/wc/v3`;
    try {
      switch (action) {
        case "list_products": {
          const res = await apiCall("WooCommerce", `${baseUrl}/products?per_page=${params.limit ?? 50}`, { headers: { Authorization: auth } });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "create_order": {
          const res = await apiCall("WooCommerce", `${baseUrl}/orders`, {
            method: "POST",
            headers: { Authorization: auth },
            body: JSON.stringify(params.order),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported WooCommerce action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("WooCommerce provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "WooCommerce requires API key configuration.", lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};
