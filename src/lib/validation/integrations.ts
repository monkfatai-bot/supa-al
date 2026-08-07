/**
 * Supa AI — Phase 10 Integration Hub — Zod validation schemas.
 *
 * Every API route under `/api/v1/integrations/*` validates its input
 * against one of the schemas below via {@link validateInput}. The
 * schemas are strict + with inferred types so the route handlers stay
 * narrow + end-to-end typed.
 *
 * @module @/lib/validation/integrations
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const integrationStatusSchema = z.enum([
  "connected",
  "disconnected",
  "error",
  "paused",
  "expired",
  "revoked",
]);

export const integrationAuthTypeSchema = z.enum([
  "oauth2",
  "api_key",
  "basic",
  "webhook",
  "none",
]);

export const credentialTypeSchema = z.enum([
  "oauth_access_token",
  "oauth_refresh_token",
  "api_key",
  "basic_password",
  "webhook_secret",
  "client_secret",
  "bearer_token",
]);

export const integrationLogLevelSchema = z.enum([
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

export const integrationEventCategorySchema = z.enum([
  "internal",
  "external",
  "workflow",
  "ai_employee",
  "notification",
  "billing",
  "crm",
  "erp",
  "integration",
]);

export const syncJobTypeSchema = z.enum([
  "full",
  "incremental",
  "webhook_triggered",
  "manual",
  "scheduled",
]);

export const syncJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "retrying",
]);

export const syncDirectionSchema = z.enum(["pull", "push", "bidirectional"]);
export const syncTriggerSchema = z.enum(["manual", "scheduled", "webhook", "event"]);

export const marketplaceAppCategorySchema = z.enum([
  "ai_provider",
  "communication",
  "email",
  "storage",
  "development",
  "payments",
  "commerce",
  "automation",
  "crm",
  "productivity",
  "analytics",
  "social",
  "other",
]);

export const installedAppStatusSchema = z.enum([
  "installed",
  "uninstalled",
  "suspended",
  "update_available",
]);

export const webhookDeliveryStatusSchema = z.enum([
  "pending",
  "delivered",
  "failed",
  "retrying",
]);

export const integrationHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "down",
  "unknown",
]);

// ---------------------------------------------------------------------------
// List query schemas
// ---------------------------------------------------------------------------

export const listIntegrationsQuerySchema = z.object({
  status: integrationStatusSchema.optional(),
  connectorKey: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListIntegrationsQuery = z.infer<typeof listIntegrationsQuerySchema>;

export const listLogsQuerySchema = z.object({
  integrationId: z.string().uuid().optional(),
  level: integrationLogLevelSchema.optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListLogsQuery = z.infer<typeof listLogsQuerySchema>;

export const listSyncJobsQuerySchema = z.object({
  integrationId: z.string().uuid().optional(),
  status: syncJobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListSyncJobsQuery = z.infer<typeof listSyncJobsQuerySchema>;

export const listWebhookDeliveriesQuerySchema = z.object({
  subscriptionId: z.string().uuid().optional(),
  status: webhookDeliveryStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListWebhookDeliveriesQuery = z.infer<typeof listWebhookDeliveriesQuerySchema>;

export const listWebhookSubscriptionsQuerySchema = z.object({
  integrationId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListWebhookSubscriptionsQuery = z.infer<typeof listWebhookSubscriptionsQuerySchema>;

export const listAppsQuerySchema = z.object({
  category: marketplaceAppCategorySchema.optional(),
  search: z.string().trim().optional(),
  isFeatured: z.coerce.boolean().optional(),
  isOfficial: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListAppsQuery = z.infer<typeof listAppsQuerySchema>;

export const listConnectorsQuerySchema = z.object({
  category: marketplaceAppCategorySchema.optional(),
  onlyConfigured: z.coerce.boolean().optional(),
});
export type ListConnectorsQuery = z.infer<typeof listConnectorsQuerySchema>;

export const analyticsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

// ---------------------------------------------------------------------------
// Body schemas
// ---------------------------------------------------------------------------

export const createIntegrationSchema = z.object({
  appId: z.string().uuid().optional(),
  connectorKey: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  authType: integrationAuthTypeSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string()).optional(),
});
export type CreateIntegrationBody = z.infer<typeof createIntegrationSchema>;

export const updateIntegrationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: integrationStatusSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string()).optional(),
});
export type UpdateIntegrationBody = z.infer<typeof updateIntegrationSchema>;

export const connectWithApiKeySchema = z.object({
  apiKey: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ConnectWithApiKeyBody = z.infer<typeof connectWithApiKeySchema>;

export const logEntrySchema = z.object({
  integrationId: z.string().uuid().optional(),
  level: integrationLogLevelSchema.optional(),
  event: z.string().trim().min(1),
  message: z.string().trim().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().trim().optional(),
  durationMs: z.number().int().min(0).optional(),
});
export type LogEntryBody = z.infer<typeof logEntrySchema>;

export const createSyncJobSchema = z.object({
  integrationId: z.string().uuid(),
  jobType: syncJobTypeSchema.optional(),
  resource: z.string().trim().optional(),
  direction: syncDirectionSchema.optional(),
  trigger: syncTriggerSchema.optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type CreateSyncJobBody = z.infer<typeof createSyncJobSchema>;

export const createWebhookSubscriptionSchema = z.object({
  integrationId: z.string().uuid().optional(),
  events: z.array(z.string()).optional(),
  targetUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});
export type CreateWebhookSubscriptionBody = z.infer<typeof createWebhookSubscriptionSchema>;

export const publishAppSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  name: z.string().trim().min(1).max(200),
  shortName: z.string().trim().max(60).optional(),
  tagline: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  category: marketplaceAppCategorySchema.optional(),
  subcategory: z.string().trim().max(120).optional(),
  connectorKey: z.string().trim().max(120).optional(),
  iconUrl: z.string().url().optional(),
  capabilities: z.array(z.string()).optional(),
  authType: integrationAuthTypeSchema.optional(),
  requiredScopes: z.array(z.string()).optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
  installInstructions: z.string().trim().max(5000).optional(),
  privacyUrl: z.string().url().optional(),
  termsUrl: z.string().url().optional(),
  documentationUrl: z.string().url().optional(),
  version: z.string().trim().max(40).optional(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isOfficial: z.boolean().optional(),
});
export type PublishAppBody = z.infer<typeof publishAppSchema>;

export const updateAppSchema = publishAppSchema.partial();
export type UpdateAppBody = z.infer<typeof updateAppSchema>;

export const installAppSchema = z.object({
  appId: z.string().uuid(),
  version: z.string().trim().max(40).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  permissionsGranted: z.array(z.string()).optional(),
});
export type InstallAppBody = z.infer<typeof installAppSchema>;

export const createReviewSchema = z.object({
  appId: z.string().uuid(),
  authorName: z.string().trim().max(120).optional(),
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().max(5000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});
export type CreateReviewBody = z.infer<typeof createReviewSchema>;

export const rateAppSchema = z.object({
  rating: z.number().int().min(1).max(5),
});
export type RateAppBody = z.infer<typeof rateAppSchema>;

export const publishVersionSchema = z.object({
  version: z.string().trim().min(1).max(40),
  changelog: z.string().trim().max(10_000).optional(),
  isBreaking: z.boolean().optional(),
  migrationScript: z.string().trim().max(50_000).optional(),
});
export type PublishVersionBody = z.infer<typeof publishVersionSchema>;

export const oauthInitiateSchema = z.object({
  connectorKey: z.string().trim().min(1),
  redirectUri: z.string().url(),
  integrationId: z.string().uuid().optional(),
  scopes: z.array(z.string()).optional(),
});
export type OAuthInitiateBody = z.infer<typeof oauthInitiateSchema>;

export const oauthCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});
export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;

export const searchSchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type SearchQuery = z.infer<typeof searchSchema>;
