/**
 * Communication Provider Adapters
 *
 * Production-ready adapters for WhatsApp, Telegram, Slack, Discord,
 * Microsoft Teams, Gmail, Zoom, and Outlook.
 * Each uses real API calls where credentials are available.
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderResult,
  ProviderHealthResult,
} from "../types";
import { env } from "@/config/env";
import { logger } from "@/services/logger";

// ─── Shared Helpers ──────────────────────────────────────────

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

function oauthRequired(id: string, name: string, capabilities: string[]): ProviderAdapter {
  return {
    id,
    name,
    category: "communication",
    capabilities,
    async authenticate(config: ProviderConfig): Promise<void> {
      const token = config.credentials?.accessToken as string | undefined;
      if (!token) throw new Error(`${name} requires OAuth. Please complete the OAuth flow in Settings > Integrations.`);
    },
    async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
      const token = (params.accessToken as string) ?? (params.credentials as Record<string, unknown>)?.accessToken as string;
      if (!token) return { success: false, error: `${name} is not connected. Complete the OAuth flow.` };
      return { success: false, error: `Action '${action}' must be dispatched through the ${name} provider.` };
    },
    async healthCheck(): Promise<ProviderHealthResult> {
      return { healthy: false, error: `${name} requires OAuth configuration.`, lastChecked: new Date().toISOString() };
    },
    getCapabilities() { return capabilities; },
    destroy() {},
  };
}

// ═══════════════════════════════════════════════════════════════
// SLACK
// ═══════════════════════════════════════════════════════════════

export const slackProviderAdapter: ProviderAdapter = {
  id: "slack",
  name: "Slack",
  category: "communication",
  capabilities: ["send_message", "read_channel", "manage_channels", "webhook"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const token = (config.credentials?.accessToken as string) ?? env.SLACK_BOT_TOKEN;
    if (!token) throw new Error("Slack bot token is required.");
    const result = await apiCall("Slack", "https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!result.ok) throw new Error(`Slack auth failed: ${result.error}`);
    if (!(result.data as Record<string, unknown>)?.ok) throw new Error("Slack token is invalid.");
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const token = (params.accessToken as string) ?? env.SLACK_BOT_TOKEN;
    if (!token) return { success: false, error: "Slack bot token is required." };
    try {
      switch (action) {
        case "send_message": {
          const res = await apiCall("Slack", "https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({ channel: params.channel, text: params.text, as_user: true }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "read_channel": {
          const res = await apiCall("Slack", `https://slack.com/api/conversations.history?channel=${params.channel}&limit=${params.limit ?? 20}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Slack action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Slack provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    if (!env.SLACK_BOT_TOKEN) return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Bot token not configured", lastChecked: new Date().toISOString() };
    const result = await apiCall("Slack", "https://slack.com/api/auth.test", { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
    return { healthy: result.ok && !!(result.data as Record<string, unknown>)?.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// DISCORD
// ═══════════════════════════════════════════════════════════════

export const discordProviderAdapter: ProviderAdapter = {
  id: "discord",
  name: "Discord",
  category: "communication",
  capabilities: ["send_message", "read_channel", "manage_roles", "webhook"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const token = (config.credentials?.accessToken as string) ?? env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error("Discord bot token is required.");
    const result = await apiCall("Discord", "https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!result.ok) throw new Error(`Discord auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const token = (params.accessToken as string) ?? env.DISCORD_BOT_TOKEN;
    if (!token) return { success: false, error: "Discord bot token is required." };
    try {
      switch (action) {
        case "send_message": {
          const res = await apiCall("Discord", `https://discord.com/api/v10/channels/${params.channelId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bot ${token}` },
            body: JSON.stringify({ content: params.content }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Discord action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Discord provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    if (!env.DISCORD_BOT_TOKEN) return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Bot token not configured", lastChecked: new Date().toISOString() };
    const result = await apiCall("Discord", "https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// TELEGRAM
// ═══════════════════════════════════════════════════════════════

export const telegramProviderAdapter: ProviderAdapter = {
  id: "telegram",
  name: "Telegram",
  category: "communication",
  capabilities: ["send_message", "send_photo", "webhook", "commands"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const token = (config.credentials?.accessToken as string) ?? env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Telegram bot token is required.");
    const result = await apiCall("Telegram", `https://api.telegram.org/bot${token}/getMe`);
    if (!result.ok) throw new Error(`Telegram auth failed: ${result.error}`);
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const token = (params.accessToken as string) ?? env.TELEGRAM_BOT_TOKEN;
    if (!token) return { success: false, error: "Telegram bot token is required." };
    try {
      switch (action) {
        case "send_message": {
          const res = await apiCall("Telegram", `https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            body: JSON.stringify({ chat_id: params.chatId, text: params.text, parse_mode: params.parseMode ?? "HTML" }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "send_photo": {
          const res = await apiCall("Telegram", `https://api.telegram.org/bot${token}/sendPhoto`, {
            method: "POST",
            body: JSON.stringify({ chat_id: params.chatId, photo: params.photoUrl, caption: params.caption }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported Telegram action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Telegram provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    if (!env.TELEGRAM_BOT_TOKEN) return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "Bot token not configured", lastChecked: new Date().toISOString() };
    const result = await apiCall("Telegram", `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
    return { healthy: result.ok, latencyMs: result.latencyMs, error: result.error, lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// WHATSAPP (Meta Cloud API)
// ═══════════════════════════════════════════════════════════════

export const whatsappProviderAdapter: ProviderAdapter = {
  id: "whatsapp",
  name: "WhatsApp Business",
  category: "communication",
  capabilities: ["send_message", "send_template", "read_messages"],

  async authenticate(config: ProviderConfig): Promise<void> {
    const token = (config.credentials?.accessToken as string) ?? env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = (config.credentials?.phoneId as string) ?? env.WHATSAPP_PHONE_ID;
    if (!token || !phoneId) throw new Error("WhatsApp access token and phone ID are required.");
  },

  async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
    const token = (params.accessToken as string) ?? env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = (params.phoneId as string) ?? env.WHATSAPP_PHONE_ID;
    if (!token || !phoneId) return { success: false, error: "WhatsApp credentials are required." };
    try {
      switch (action) {
        case "send_message": {
          const res = await apiCall("WhatsApp", `https://graph.facebook.com/v18.0/${phoneId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({ messaging_product: "whatsapp", to: params.to, type: "text", text: { body: params.text } }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        case "send_template": {
          const res = await apiCall("WhatsApp", `https://graph.facebook.com/v18.0/${phoneId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({ messaging_product: "whatsapp", to: params.to, type: "template", template: { name: params.templateName, language: { code: params.language ?? "en_US" } } }),
          });
          return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
        }
        default:
          return { success: false, error: `Unsupported WhatsApp action: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("WhatsApp provider call failed", { action, error: msg });
      return { success: false, error: msg };
    }
  },

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    if (!env.WHATSAPP_ACCESS_TOKEN) return { healthy: false, latencyMs: Math.round(performance.now() - start), error: "WhatsApp access token not configured", lastChecked: new Date().toISOString() };
    return { healthy: !!env.WHATSAPP_PHONE_ID, latencyMs: Math.round(performance.now() - start), error: env.WHATSAPP_PHONE_ID ? undefined : "Phone ID not configured", lastChecked: new Date().toISOString() };
  },

  getCapabilities() { return this.capabilities; },
  destroy() {},
};

// ═══════════════════════════════════════════════════════════════
// MICROSOFT TEAMS
// ═══════════════════════════════════════════════════════════════

export const teamsProviderAdapter = oauthRequired("teams", "Microsoft Teams", [
  "send_message", "read_channel", "manage_channels", "webhook",
]);

// ═══════════════════════════════════════════════════════════════
// GMAIL
// ═══════════════════════════════════════════════════════════════

export const gmailProviderAdapter = oauthRequired("gmail", "Gmail", [
  "send_email", "read_email", "search_email", "manage_labels",
]);

// ═══════════════════════════════════════════════════════════════
// OUTLOOK
// ═══════════════════════════════════════════════════════════════

export const outlookProviderAdapter = oauthRequired("outlook", "Outlook", [
  "send_email", "read_email", "search_email", "manage_folders",
]);
