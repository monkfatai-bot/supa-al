/**
 * Supa AI — Phase 10 Integration Hub — client-safe types.
 *
 * Domain-level types shared by the integration service layer, API routes,
 * and the client UI. These are intentionally plain TS types (no Zod, no
 * `server-only`) so the file is safe to import from client components
 * via the {@link "@/lib/integrations/client"} barrel.
 *
 * The DB-level row shapes live in `@/lib/supabase/types`
 * (`Tables<'...'>`). The types here are the *service* shape — narrower
 * column sets, friendly camelCase field names, and discriminated unions
 * for status enums.
 *
 * @module @/lib/integrations/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Status enums (mirror the CHECK constraints in 0015_phase10_integrations.sql)
// ---------------------------------------------------------------------------

export type IntegrationStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "paused"
  | "expired"
  | "revoked";

export type IntegrationAuthType =
  | "oauth2"
  | "api_key"
  | "basic"
  | "webhook"
  | "none";

export type CredentialType =
  | "oauth_access_token"
  | "oauth_refresh_token"
  | "api_key"
  | "basic_password"
  | "webhook_secret"
  | "client_secret"
  | "bearer_token";

export type IntegrationLogLevel =
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

export type IntegrationEventCategory =
  | "internal"
  | "external"
  | "workflow"
  | "ai_employee"
  | "notification"
  | "billing"
  | "crm"
  | "erp"
  | "integration";

export type SyncJobType =
  | "full"
  | "incremental"
  | "webhook_triggered"
  | "manual"
  | "scheduled";

export type SyncJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

export type SyncDirection = "pull" | "push" | "bidirectional";

export type SyncTrigger = "manual" | "scheduled" | "webhook" | "event";

export type MarketplaceAppCategory =
  | "ai_provider"
  | "communication"
  | "email"
  | "storage"
  | "development"
  | "payments"
  | "commerce"
  | "automation"
  | "crm"
  | "productivity"
  | "analytics"
  | "social"
  | "other";

export type InstalledAppStatus =
  | "installed"
  | "uninstalled"
  | "suspended"
  | "update_available";

export type WebhookDeliveryStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "retrying";

export type IntegrationHealthStatus =
  | "healthy"
  | "degraded"
  | "down"
  | "unknown";

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

export type Integration = Tables<"integrations">;
export type IntegrationCredential = Tables<"integration_credentials">;
export type IntegrationLog = Tables<"integration_logs">;
export type IntegrationEvent = Tables<"integration_events">;
export type IntegrationSyncJob = Tables<"integration_sync_jobs">;
export type MarketplaceApp = Tables<"marketplace_apps">;
export type InstalledApp = Tables<"installed_apps">;
export type AppReview = Tables<"app_reviews">;
export type AppRating = Tables<"app_ratings">;
export type WebhookSubscription = Tables<"webhook_subscriptions">;
export type WebhookDelivery = Tables<"webhook_deliveries">;
export type IntegrationHealth = Tables<"integration_health">;
export type IntegrationPermission = Tables<"integration_permissions">;
export type IntegrationVersion = Tables<"integration_versions">;
export type IntegrationAnalytics = Tables<"integration_analytics">;

export type IntegrationInsert = TablesInsert<"integrations">;
export type IntegrationUpdate = TablesUpdate<"integrations">;
export type IntegrationCredentialInsert = TablesInsert<"integration_credentials">;
export type IntegrationCredentialUpdate = TablesUpdate<"integration_credentials">;
export type IntegrationLogInsert = TablesInsert<"integration_logs">;
export type IntegrationEventInsert = TablesInsert<"integration_events">;
export type IntegrationSyncJobInsert = TablesInsert<"integration_sync_jobs">;
export type IntegrationSyncJobUpdate = TablesUpdate<"integration_sync_jobs">;
export type MarketplaceAppInsert = TablesInsert<"marketplace_apps">;
export type MarketplaceAppUpdate = TablesUpdate<"marketplace_apps">;
export type InstalledAppInsert = TablesInsert<"installed_apps">;
export type InstalledAppUpdate = TablesUpdate<"installed_apps">;
export type AppReviewInsert = TablesInsert<"app_reviews">;
export type AppReviewUpdate = TablesUpdate<"app_reviews">;
export type AppRatingInsert = TablesInsert<"app_ratings">;
export type WebhookSubscriptionInsert = TablesInsert<"webhook_subscriptions">;
export type WebhookSubscriptionUpdate = TablesUpdate<"webhook_subscriptions">;
export type WebhookDeliveryInsert = TablesInsert<"webhook_deliveries">;
export type WebhookDeliveryUpdate = TablesUpdate<"webhook_deliveries">;
export type IntegrationHealthInsert = TablesInsert<"integration_health">;
export type IntegrationHealthUpdate = TablesUpdate<"integration_health">;
export type IntegrationPermissionInsert = TablesInsert<"integration_permissions">;
export type IntegrationPermissionUpdate = TablesUpdate<"integration_permissions">;
export type IntegrationVersionInsert = TablesInsert<"integration_versions">;
export type IntegrationAnalyticsInsert = TablesInsert<"integration_analytics">;
export type IntegrationAnalyticsUpdate = TablesUpdate<"integration_analytics">;

// ---------------------------------------------------------------------------
// DTOs — friendly shapes consumed by the API routes + UI.
// ---------------------------------------------------------------------------

/** Input for {@link IntegrationService.create}. */
export interface CreateIntegrationInput {
  appId?: string;
  connectorKey: string;
  name: string;
  authType?: IntegrationAuthType;
  config?: Record<string, unknown>;
  capabilities?: string[];
}

/** Input for {@link IntegrationService.update}. */
export interface UpdateIntegrationInput {
  name?: string;
  status?: IntegrationStatus;
  config?: Record<string, unknown>;
  capabilities?: string[];
  /** Last error message — set to `null` to clear. Snake-cased for DB mapping. */
  last_error?: string | null;
}

/** Input for connecting an integration with an API key. */
export interface ConnectWithApiKeyInput {
  apiKey: string;
  metadata?: Record<string, unknown>;
}

/** Input for {@link IntegrationService.listLogs}. */
export interface ListLogsOptions {
  integrationId?: string;
  level?: IntegrationLogLevel;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Input for {@link IntegrationService.log}. */
export interface LogInput {
  integrationId?: string;
  level?: IntegrationLogLevel;
  event: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  durationMs?: number;
}

/** Input for {@link IntegrationService.getAnalytics}. */
export interface AnalyticsRangeOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/** Input for publishing a marketplace app. */
export interface PublishAppInput {
  slug: string;
  name: string;
  shortName?: string;
  tagline?: string;
  description?: string;
  category?: MarketplaceAppCategory;
  subcategory?: string;
  connectorKey?: string;
  iconUrl?: string;
  capabilities?: string[];
  authType?: IntegrationAuthType;
  requiredScopes?: string[];
  configSchema?: Record<string, unknown>;
  installInstructions?: string;
  privacyUrl?: string;
  termsUrl?: string;
  documentationUrl?: string;
  version?: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  isOfficial?: boolean;
}

export type UpdateAppInput = Partial<PublishAppInput>;

/** Input for installing a marketplace app into a workspace. */
export interface InstallAppInput {
  appId: string;
  version?: string;
  config?: Record<string, unknown>;
  permissionsGranted?: string[];
}

/** Input for creating a webhook subscription. */
export interface CreateWebhookSubscriptionInput {
  integrationId?: string;
  events?: string[];
  targetUrl?: string;
  isActive?: boolean;
}

/** Input for creating an app review. */
export interface CreateReviewInput {
  appId: string;
  authorName?: string;
  title?: string;
  body?: string;
  rating?: number;
}

/** Input for publishing a new version of an app. */
export interface PublishVersionInput {
  version: string;
  changelog?: string;
  isBreaking?: boolean;
  migrationScript?: string;
}

/** Input for creating a sync job. */
export interface CreateSyncJobInput {
  integrationId: string;
  jobType?: SyncJobType;
  resource?: string;
  direction?: SyncDirection;
  trigger?: SyncTrigger;
  maxRetries?: number;
  details?: Record<string, unknown>;
}

/** Input for {@link MarketplaceService.listApps}. */
export interface ListAppsOptions {
  category?: MarketplaceAppCategory;
  search?: string;
  isFeatured?: boolean;
  isOfficial?: boolean;
  limit?: number;
  offset?: number;
}

/** Input for {@link IntegrationService.listConnectors}. */
export interface ListConnectorsOptions {
  category?: MarketplaceAppCategory;
  onlyConfigured?: boolean;
}

/** Result returned by {@link MarketplaceService.checkForUpdates}. */
export interface AppUpdateInfo {
  appId: string;
  slug: string;
  name: string;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}

/** Aggregated health snapshot for a workspace. */
export interface HealthDashboardSummary {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
  integrations: Array<{
    integrationId: string;
    name: string;
    connectorKey: string;
    status: IntegrationStatus;
    healthStatus: IntegrationHealthStatus;
    latencyMs: number | null;
    errorRate: number;
    lastCheckAt: string | null;
  }>;
}

/** Aggregated analytics summary for a workspace. */
export interface AnalyticsSummary {
  totalApiCalls: number;
  totalApiErrors: number;
  totalSyncRuns: number;
  totalRecordsSynced: number;
  totalWebhooksReceived: number;
  totalWebhooksDelivered: number;
  totalRateLimitHits: number;
  avgErrorRate: number;
  rows: IntegrationAnalytics[];
}

/** Aggregated sync-job stats for a workspace. */
export interface SyncStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  retrying: number;
  totalRecordsSynced: number;
  recent: IntegrationSyncJob[];
}

/** Result returned by {@link OAuthManager.initiate}. */
export interface OAuthInitiateResult {
  authorizationUrl: string;
  state: string;
  redirectUri: string;
  connectorKey: string;
}

/** Result returned by {@link OAuthManager.handleCallback}. */
export interface OAuthCallbackResult {
  integrationId: string;
  status: IntegrationStatus;
  expiresAt: string | null;
  scopes: string[];
}

/** Public-facing shape of a connector definition. */
export interface ConnectorDefinition {
  key: string;
  name: string;
  category: MarketplaceAppCategory;
  authType: IntegrationAuthType;
  capabilities: string[];
  icon?: string;
  description?: string;
  requiredScopes?: string[];
  configSchema?: Record<string, unknown>;
  /** Returns true when the connector's required env vars are set. */
  configured?: boolean;
}

/** Result returned by {@link BaseConnector.healthCheck}. */
export interface ConnectorHealthResult {
  status: IntegrationHealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal event bus types
// ---------------------------------------------------------------------------

/** A subscriber to the internal event bus. */
export type EventBusSubscriber = (
  event: IntegrationEvent,
) => void | Promise<void>;

/** Helper object exposing the canonical event names by category. */
export const IntegrationEvents = {
  // workflow
  workflowRunStarted: "workflow.run.started",
  workflowRunCompleted: "workflow.run.completed",
  workflowRunFailed: "workflow.run.failed",
  // ai_employee
  employeeHired: "employee.hired",
  employeeTaskCompleted: "employee.task.completed",
  employeeMessage: "employee.message",
  // crm
  crmContactCreated: "crm.contact.created",
  crmContactUpdated: "crm.contact.updated",
  crmDealStageChanged: "crm.deal.stage_changed",
  // erp
  erpInvoiceCreated: "erp.invoice.created",
  erpPaymentReceived: "erp.payment.received",
  // billing
  billingSubscriptionCreated: "billing.subscription.created",
  billingSubscriptionCancelled: "billing.subscription.cancelled",
  billingInvoicePaid: "billing.invoice.paid",
  // notification
  notificationSent: "notification.sent",
  notificationFailed: "notification.failed",
  // workspace
  workspaceMemberAdded: "workspace.member.added",
  workspaceMemberRemoved: "workspace.member.removed",
  workspaceDocumentCreated: "workspace.document.created",
  // search
  searchIndexUpdated: "search.index.updated",
  // kb
  kbArticlePublished: "kb.article.published",
  // reports
  reportGenerated: "report.generated",
  // integration
  integrationConnected: "integration.connected",
  integrationDisconnected: "integration.disconnected",
  integrationSyncCompleted: "integration.sync.completed",
  integrationSyncFailed: "integration.sync.failed",
  webhookReceived: "integration.webhook.received",
} as const;

export type IntegrationEventName =
  (typeof IntegrationEvents)[keyof typeof IntegrationEvents];

// Forward-declared type used in DTOs above (kept at bottom to avoid
// circular imports with service modules). The MarketplaceService type
// is only referenced as a type, so a thin `import type` would also work
// but we keep the DTOs together for ergonomics.
//
type MarketplaceService = unknown;
