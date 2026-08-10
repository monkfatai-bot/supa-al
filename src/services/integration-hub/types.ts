/**
 * Integration Hub — shared TypeScript interfaces.
 * Builds on top of the generated database types.
 */

import type { Json } from "@/types/generated/database";
import type {
  Integration,
  IntegrationAccount,
  IntegrationLog,
  IntegrationCategory,
  IntegrationStatus,
  OAuthProvider,
  EventDirection,
  LogStatus,
  WebhookStatus,
  ApiKeyStatus,
} from "@/types/generated/database";

// ─── Response envelope ──────────────────────────────────────────

export interface ServiceResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// ─── Integration Hub ────────────────────────────────────────────

export interface IntegrationConnection {
  integration: Integration;
  account: IntegrationAccount | null;
  isInstalled: boolean;
}

export interface IntegrationWithAccount extends Integration {
  account: IntegrationAccount | null;
}

export interface IntegrationHealth {
  accountId: string;
  status: IntegrationStatus;
  lastUsedAt: string | null;
  errorCount: number;
  successCount: number;
  avgDurationMs: number | null;
}

export interface IntegrationLogEntry extends IntegrationLog {
  integrationName?: string;
}

export interface UsageStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  timeoutCalls: number;
  avgDurationMs: number | null;
  byIntegration: Array<{
    integrationId: string;
    integrationName: string;
    totalCalls: number;
    successCalls: number;
    errorCalls: number;
  }>
  byAction: Array<{
    action: string;
    totalCalls: number;
    successCalls: number;
  errorCalls: number;
  }>
}

// ─── OAuth ──────────────────────────────────────────────────────

export interface OAuthState {
  authorizationUrl: string;
  state: string;
}

export interface OAuthTokenStatus {
  valid: boolean;
  provider: OAuthProvider;
  scope: string;
  expiresAt: string | null;
  refreshExpiresAt: string | null;
  isExpired: boolean;
  isRefreshable: boolean;
}

export interface ProviderConfig {
  provider: OAuthProvider;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scopes: string[];
}

// ─── API Keys ────────────────────────────────────────────────────

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: Json;
  scope: string;
  rateLimit: number;
  usageCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  status: ApiKeyStatus;
  createdBy: string | null;
  createdAt: string;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  accountId?: string;
  workspaceId?: string;
  permissions?: Json;
  keyId?: string;
}

export interface ApiKeyUsageStats {
  totalUsage: number;
  dailyUsage: Array<{ date: string; count: number }>;
}

// ─── Webhooks ────────────────────────────────────────────────────

export interface WebhookInfo {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: WebhookStatus;
  retryCount: number;
  timeoutMs: number;
  headers: Json;
  lastTriggeredAt: string | null;
  successCount: number;
  failureCount: number;
  createdBy: string | null;
  createdAt: string;
}

export interface WebhookDeliveryResult {
  success: boolean;
  responseStatus: number;
  responseBody?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface WebhookStats {
  totalEvents: number;
  successCount: number;
  failureCount: number;
  deadLetterCount: number;
  successRate: number;
  avgResponseTimeMs: number | null;
}

// ─── Event Bus ───────────────────────────────────────────────────

export interface EventBusSubscription {
  id: string;
  eventType: string;
  handlerType: "webhook" | "automation" | "employee" | "internal";
  handlerConfig: Json;
  status: IntegrationStatus;
  retryCount: number;
  filters: Json;
  createdAt: string;
}

// ─── Action params ───────────────────────────────────────────────

export interface ListIntegrationsParams {
  workspaceId: string;
  category?: IntegrationCategory;
  status?: IntegrationStatus;
}

export interface ConnectIntegrationParams {
  workspaceId: string;
  integrationId: string;
  config: Json;
  displayName?: string;
}

export interface UpdateIntegrationConfigParams {
  workspaceId: string;
  accountId: string;
  config: Json;
}

export interface LogIntegrationParams {
  workspaceId: string;
  integrationId?: string;
  accountId?: string;
  action: string;
  direction: EventDirection;
  request?: Json;
  response?: Json;
  status: LogStatus;
  errorMessage?: string;
  durationMs?: number;
}

export interface GetIntegrationLogsParams {
  workspaceId: string;
  accountId?: string;
  action?: string;
  direction?: EventDirection;
  limit?: number;
  offset?: number;
}

export interface GetUsageAnalyticsParams {
  workspaceId: string;
  startDate: string;
  endDate: string;
}

export interface CreateApiKeyParams {
  workspaceId: string;
  name: string;
  permissions: Json;
  scope: string;
  rateLimit: number;
  expiresInDays?: number;
}

export interface CreateWebhookParams {
  workspaceId: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  retryCount?: number;
  timeoutMs?: number;
  headers?: Json;
}

export interface PublishEventParams {
  workspaceId: string;
  eventType: string;
  payload: Json;
  source?: string;
}

export interface SubscribeToEventParams {
  workspaceId: string;
  eventType: string;
  handlerType: "webhook" | "automation" | "employee" | "internal";
  handlerConfig: Json;
  filters?: Json;
}
