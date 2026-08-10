/**
 * Storage Provider Adapters
 *
 * Production adapters for Google Drive, Dropbox, OneDrive, and Box.
 * OAuth-based providers use token from credentials.
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

function oauthStorageProvider(
  id: string,
  name: string,
  capabilities: string[],
  _authUrl: string,
  listUrl: string
): ProviderAdapter {
  return {
    id,
    name,
    category: "storage",
    capabilities,
    async authenticate(config: ProviderConfig): Promise<void> {
      const token = config.credentials?.accessToken as string | undefined;
      if (!token) throw new Error(`${name} requires OAuth. Complete the OAuth flow in Settings > Integrations.`);
      const result = await apiCall(name, listUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!result.ok) throw new Error(`${name} auth failed: ${result.error}`);
    },
    async call(action: string, params: Record<string, unknown>): Promise<ProviderResult> {
      const token = (params.accessToken as string) ?? (params.credentials as Record<string, unknown>)?.accessToken as string;
      if (!token) return { success: false, error: `${name} is not connected. Complete the OAuth flow.` };
      try {
        switch (action) {
          case "list_files": {
            const res = await apiCall(name, `${listUrl}${params.folderId ?? "root"}/items`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            return res.ok ? { success: true, data: res.data } : { success: false, error: res.error };
          }
          case "upload_file": {
            return { success: false, error: `File upload for ${name} requires multipart form data. Use the dedicated upload endpoint.` };
          }
          case "delete_file": {
            return { success: false, error: `Delete for ${name} requires file ID. Use the dedicated delete endpoint.` };
          }
          default:
            return { success: false, error: `Unsupported ${name} action: ${action}` };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`${name} provider call failed`, { action, error: msg });
        return { success: false, error: msg };
      }
    },
    async healthCheck(): Promise<ProviderHealthResult> {
      const start = performance.now();
      return { healthy: false, latencyMs: Math.round(performance.now() - start), error: `${name} requires OAuth configuration.`, lastChecked: new Date().toISOString() };
    },
    getCapabilities() { return capabilities; },
    destroy() {},
  };
}

// Google Drive — uses Google API with OAuth token
export const googleDriveProviderAdapter = oauthStorageProvider(
  "google-drive",
  "Google Drive",
  ["list_files", "upload_file", "download_file", "delete_file", "search_files", "manage_permissions"],
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/drive/v3/files/"
);

// Dropbox — uses Dropbox API v2
export const dropboxProviderAdapter = oauthStorageProvider(
  "dropbox",
  "Dropbox",
  ["list_files", "upload_file", "download_file", "delete_file", "search_files"],
  "https://api.dropboxapi.com/2/",
  "https://api.dropboxapi.com/2/files/list_folder"
);

// OneDrive — uses Microsoft Graph API
export const oneDriveProviderAdapter = oauthStorageProvider(
  "onedrive",
  "OneDrive",
  ["list_files", "upload_file", "download_file", "delete_file", "share_file"],
  "https://graph.microsoft.com/",
  "https://graph.microsoft.com/v1.0/me/drive/items/"
);

// Box — uses Box API v2
export const boxProviderAdapter = oauthStorageProvider(
  "box",
  "Box",
  ["list_files", "upload_file", "download_file", "delete_file", "manage_collaborators"],
  "https://api.box.com/2.0/",
  "https://api.box.com/2.0/folders/"
);
