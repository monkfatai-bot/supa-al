/**
 * Supa AI — Phase 10 Integration Hub — Integration Service.
 *
 * The single, canonical write-path for the Integration domain. Owns
 * every `integrations`, `integration_logs`, `integration_permissions`,
 * `integration_health`, and `integration_analytics` table operation:
 * CRUD, connect with API key, disconnect, health check, logging,
 * permissions, and analytics aggregation.
 *
 * Constructed with the **admin** Supabase client (RLS bypassed). The
 * service layer enforces workspace membership via {@link assertMember}
 * before every mutation, so the surface stays defense-in-depth.
 *
 * @module @/lib/integrations/integration-service
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  ValidationError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/types";

import { connectorRegistry } from "./connectors/registry";
import { ensureRegistered } from "./connectors/registry";
import {
  assertIntegrationAccess,
  toDbError,
  wrapIntegrationError,
} from "./core";
import { getCredentialVault } from "./credential-vault";
import {
  IntegrationEvents,
  eventBus,
} from "./event-bus";
import type {
  AnalyticsRangeOptions,
  AnalyticsSummary,
  ConnectorDefinition,
  ConnectWithApiKeyInput,
  CreateIntegrationInput,
  HealthDashboardSummary,
  Integration,
  IntegrationAnalytics,
  IntegrationHealth,
  IntegrationHealthStatus,
  IntegrationLog,
  IntegrationPermission,
  ListConnectorsOptions,
  ListLogsOptions,
  LogInput,
  UpdateIntegrationInput,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 200;
const DEFAULT_LOGS_LIMIT = 100;
const MAX_LOGS_LIMIT = 500;
const HEALTH_RATE_LIMIT_WINDOW_MIN = 1;

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Server-only service for the Integration domain. Construct via
 * {@link getIntegrationService}; never `new` it directly outside tests.
 */
export class IntegrationService {
  constructor(private readonly supabase: AdminSupabaseClient) {
    ensureRegistered();
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * List integrations for a workspace (newest first). Optional
   * `status` + `connectorKey` filters.
   */
  async list(input: {
    workspaceId: string;
    status?: Integration["status"];
    connectorKey?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Integration[]> {
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, input.offset ?? 0);
    try {
      let query = this.supabase
        .from("integrations")
        .select()
        .eq("workspace_id", input.workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (input.status) query = query.eq("status", input.status);
      if (input.connectorKey) query = query.eq("connector_key", input.connectorKey);
      if (input.search && input.search.trim().length > 0) {
        const q = input.search.trim();
        query = query.or(`name.ilike.%${q}%,connector_key.ilike.%${q}%`);
      }
      const { data, error } = await query;
      if (error) throw toDbError(error, "integration.list failed");
      return (data ?? []) as unknown as Integration[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing integrations.", {
        workspaceId: input.workspaceId,
      });
    }
  }

  /**
   * Fetch a single integration by id. Returns `null` when not found.
   */
  async get(id: string): Promise<Integration | null> {
    try {
      const { data, error } = await this.supabase
        .from("integrations")
        .select()
        .eq("id", id)
        .maybeSingle();
      if (error) throw toDbError(error, "integration.get failed");
      return (data as unknown as Integration) ?? null;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching integration.", { id });
    }
  }

  /**
   * Create a new integration. The caller's `userId` is recorded on
   * `installed_by`.
   */
  async create(input: {
    workspaceId: string;
    userId: string;
    data: CreateIntegrationInput;
  }): Promise<Integration> {
    if (!input.data.connectorKey?.trim()) {
      throw new ValidationError("`connectorKey` is required.");
    }
    if (!input.data.name?.trim()) {
      throw new ValidationError("`name` is required.");
    }

    try {
      const row: TablesInsert<"integrations"> = {
        workspace_id: input.workspaceId,
        app_id: input.data.appId ?? null,
        connector_key: input.data.connectorKey,
        name: input.data.name,
        status: "disconnected",
        auth_type: input.data.authType ?? "none",
        config: (input.data.config ?? {}) as unknown as TablesInsert<"integrations">["config"],
        capabilities: (input.data.capabilities ?? []) as unknown as TablesInsert<"integrations">["capabilities"],
        installed_by: input.userId,
      };
      const { data, error } = await this.supabase
        .from("integrations")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "integration.create failed");
      if (!data) throw new DatabaseError("integration.create returned no row.");

      void eventBus.publish({
        workspaceId: input.workspaceId,
        source: "integration-service",
        type: IntegrationEvents.integrationConnected,
        category: "integration",
        payload: { integrationId: (data as unknown as Integration).id, connectorKey: input.data.connectorKey },
      });
      return data as unknown as Integration;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure creating integration.", {
        workspaceId: input.workspaceId,
      });
    }
  }

  /**
   * Patch an integration. Only the supplied fields are written.
   */
  async update(id: string, data: UpdateIntegrationInput): Promise<Integration> {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.status !== undefined) patch.status = data.status;
    if (data.config !== undefined) patch.config = data.config;
    if (data.capabilities !== undefined) patch.capabilities = data.capabilities;
    try {
      const { data: row, error } = await this.supabase
        .from("integrations")
        .update(patch as never)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "integration.update failed");
      if (!row) throw new NotFoundError("Integration", id);
      return row as unknown as Integration;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      throw wrapIntegrationError(err, "Unexpected failure updating integration.", { id });
    }
  }

  /**
   * Hard-delete an integration. Cascades to credentials, logs,
   * sync jobs, webhooks, health, permissions, analytics.
   */
  async delete(id: string): Promise<void> {
    try {
      const vault = getCredentialVault();
      await vault.deleteAll(id);

      const { error } = await this.supabase
        .from("integrations")
        .delete()
        .eq("id", id);
      if (error) throw toDbError(error, "integration.delete failed");

      void eventBus.publish({
        workspaceId: null,
        source: "integration-service",
        type: IntegrationEvents.integrationDisconnected,
        category: "integration",
        payload: { integrationId: id },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure deleting integration.", { id });
    }
  }

  // -----------------------------------------------------------------------
  // Connect / Disconnect
  // -----------------------------------------------------------------------

  /**
   * Connect an integration with an API key. Encrypts + stores the key
   * via the credential vault and marks the integration `connected`.
   */
  async connectWithApiKey(input: {
    integrationId: string;
    userId: string;
    data: ConnectWithApiKeyInput;
  }): Promise<Integration> {
    if (!input.data.apiKey?.trim()) {
      throw new ValidationError("`apiKey` is required.");
    }
    const { workspaceId } = await assertIntegrationAccess(
      this.supabase,
      input.integrationId,
      input.userId,
      true,
    );

    const vault = getCredentialVault();
    await vault.store({
      integrationId: input.integrationId,
      workspaceId,
      type: "api_key",
      value: input.data.apiKey,
      metadata: input.data.metadata,
    });

    return this.update(input.integrationId, {
      status: "connected",
      last_error: null,
      config: { ...(input.data.metadata ?? {}) } as Record<string, unknown>,
    });
  }

  /**
   * Disconnect an integration: deletes all credentials + marks
   * `disconnected`. The integration row itself is preserved so the
   * user can re-connect.
   */
  async disconnect(input: {
    integrationId: string;
    userId: string;
  }): Promise<Integration> {
    const { workspaceId } = await assertIntegrationAccess(
      this.supabase,
      input.integrationId,
      input.userId,
      true,
    );
    const vault = getCredentialVault();
    await vault.deleteAll(input.integrationId);

    void eventBus.publish({
      workspaceId,
      source: "integration-service",
      type: IntegrationEvents.integrationDisconnected,
      category: "integration",
      payload: { integrationId: input.integrationId },
    });

    return this.update(input.integrationId, {
      status: "disconnected",
      last_error: null,
    });
  }

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  /**
   * Run a health check for an integration: invoke the connector's
   * `healthCheck()`, persist the result to `integration_health`,
   * and return the new health row.
   */
  async checkHealth(integrationId: string): Promise<IntegrationHealth> {
    try {
      const { data: integration, error } = await this.supabase
        .from("integrations")
        .select("workspace_id, connector_key")
        .eq("id", integrationId)
        .maybeSingle();
      if (error) throw toDbError(error, "integration.checkHealth: lookup failed");
      if (!integration) throw new NotFoundError("Integration", integrationId);
      const row = integration as unknown as { workspace_id: string; connector_key: string };

      let status: IntegrationHealthStatus = "unknown";
      let latencyMs: number | null = null;
      let message: string | undefined;
      let details: Record<string, unknown> = {};
      try {
        if (connectorRegistry.has(row.connector_key)) {
          const connector = connectorRegistry.get(row.connector_key);
          const result = await connector.healthCheck();
          status = result.status;
          latencyMs = result.latencyMs;
          message = result.message;
          details = result.details ?? {};
        } else {
          status = "unknown";
          message = `Connector ${row.connector_key} is not registered.`;
        }
      } catch (err) {
        status = "down";
        message = err instanceof Error ? err.message : String(err);
      }

      const insert: TablesInsert<"integration_health"> = {
        workspace_id: row.workspace_id,
        integration_id: integrationId,
        status,
        latency_ms: latencyMs,
        details: { message, ...details } as unknown as TablesInsert<"integration_health">["details"],
      };
      const { data: health, error: healthErr } = await this.supabase
        .from("integration_health")
        .insert(insert as never)
        .select()
        .single();
      if (healthErr) throw toDbError(healthErr, "integration.checkHealth: insert failed");
      return health as unknown as IntegrationHealth;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure checking integration health.", {
        integrationId,
      });
    }
  }

  /**
   * Get the aggregated health dashboard for a workspace. Returns counts
   * by status + a per-integration breakdown using each integration's
   * most recent health row.
   */
  async getHealthDashboard(workspaceId: string): Promise<HealthDashboardSummary> {
    try {
      const { data: integrations, error } = await this.supabase
        .from("integrations")
        .select("id, name, connector_key, status")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw toDbError(error, "integration.getHealthDashboard failed");
      const rows = (integrations ?? []) as unknown as Array<{
        id: string;
        name: string;
        connector_key: string;
        status: Integration["status"];
      }>;
      if (rows.length === 0) {
        return {
          total: 0,
          healthy: 0,
          degraded: 0,
          down: 0,
          unknown: 0,
          integrations: [],
        };
      }

      // Fetch latest health row per integration in one round-trip.
      const integrationIds = rows.map((r) => r.id);
      const { data: healthRows, error: healthErr } = await this.supabase
        .from("integration_health")
        .select()
        .in("integration_id", integrationIds)
        .order("last_check_at", { ascending: false });
      if (healthErr) throw toDbError(healthErr, "integration.getHealthDashboard: health fetch failed");
      const allHealth = (healthRows ?? []) as unknown as IntegrationHealth[];
      const latestByIntegration = new Map<string, IntegrationHealth>();
      for (const h of allHealth) {
        if (!latestByIntegration.has(h.integration_id)) {
          latestByIntegration.set(h.integration_id, h);
        }
      }

      const summary: HealthDashboardSummary = {
        total: rows.length,
        healthy: 0,
        degraded: 0,
        down: 0,
        unknown: 0,
        integrations: [],
      };
      for (const r of rows) {
        const h = latestByIntegration.get(r.id);
        const healthStatus: IntegrationHealthStatus = h?.status ?? "unknown";
        if (healthStatus === "healthy") summary.healthy += 1;
        else if (healthStatus === "degraded") summary.degraded += 1;
        else if (healthStatus === "down") summary.down += 1;
        else summary.unknown += 1;
        summary.integrations.push({
          integrationId: r.id,
          name: r.name,
          connectorKey: r.connector_key,
          status: r.status,
          healthStatus,
          latencyMs: h?.latency_ms ?? null,
          errorRate: h?.error_rate ?? 0,
          lastCheckAt: h?.last_check_at ?? null,
        });
      }
      return summary;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching health dashboard.", {
        workspaceId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Logs
  // -----------------------------------------------------------------------

  /**
   * Append a log entry for an integration (or workspace-level when
   * `integrationId` is null).
   */
  async log(input: {
    workspaceId: string;
    data: LogInput;
  }): Promise<IntegrationLog> {
    try {
      const row: TablesInsert<"integration_logs"> = {
        workspace_id: input.workspaceId,
        integration_id: input.data.integrationId ?? null,
        level: input.data.level ?? "info",
        event: input.data.event,
        message: input.data.message,
        details: (input.data.details ?? {}) as unknown as TablesInsert<"integration_logs">["details"],
        request_id: input.data.requestId ?? null,
        duration_ms: input.data.durationMs ?? null,
      };
      const { data, error } = await this.supabase
        .from("integration_logs")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "integration.log failed");
      return data as unknown as IntegrationLog;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure appending log.", {
        workspaceId: input.workspaceId,
      });
    }
  }

  /**
   * List logs for a workspace (newest first). Optional `integrationId`,
   * `level`, and free-text `search` filters.
   */
  async listLogs(input: {
    workspaceId: string;
    options?: ListLogsOptions;
  }): Promise<IntegrationLog[]> {
    const opts = input.options ?? {};
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LOGS_LIMIT, MAX_LOGS_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      let query = this.supabase
        .from("integration_logs")
        .select()
        .eq("workspace_id", input.workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.integrationId) query = query.eq("integration_id", opts.integrationId);
      if (opts.level) query = query.eq("level", opts.level);
      if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        query = query.or(`event.ilike.%${q}%,message.ilike.%${q}%`);
      }
      const { data, error } = await query;
      if (error) throw toDbError(error, "integration.listLogs failed");
      return (data ?? []) as unknown as IntegrationLog[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing logs.");
    }
  }

  // -----------------------------------------------------------------------
  // Permissions
  // -----------------------------------------------------------------------

  /**
   * List active permissions granted to an integration.
   */
  async listPermissions(integrationId: string): Promise<IntegrationPermission[]> {
    try {
      const { data, error } = await this.supabase
        .from("integration_permissions")
        .select()
        .eq("integration_id", integrationId)
        .eq("is_active", true)
        .order("granted_at", { ascending: false });
      if (error) throw toDbError(error, "integration.listPermissions failed");
      return (data ?? []) as unknown as IntegrationPermission[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing permissions.", { integrationId });
    }
  }

  /**
   * Revoke a permission (sets `revoked_at` + `is_active = false`).
   */
  async revokePermission(input: {
    permissionId: string;
    userId: string;
  }): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("integration_permissions")
        .update({
          revoked_at: new Date().toISOString(),
          is_active: false,
        } as never)
        .eq("id", input.permissionId);
      if (error) throw toDbError(error, "integration.revokePermission failed");
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure revoking permission.", {
        permissionId: input.permissionId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  /**
   * Fetch aggregated analytics for a workspace over an optional date
   * range. Returns the per-integration rows + the workspace totals.
   */
  async getAnalytics(input: {
    workspaceId: string;
    options?: AnalyticsRangeOptions;
  }): Promise<AnalyticsSummary> {
    const opts = input.options ?? {};
    const limit = Math.max(1, Math.min(opts.limit ?? 100, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      let query = this.supabase
        .from("integration_analytics")
        .select()
        .eq("workspace_id", input.workspaceId)
        .order("metric_date", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.startDate) query = query.gte("metric_date", opts.startDate);
      if (opts.endDate) query = query.lte("metric_date", opts.endDate);
      const { data, error } = await query;
      if (error) throw toDbError(error, "integration.getAnalytics failed");
      const rows = (data ?? []) as unknown as IntegrationAnalytics[];

      const summary: AnalyticsSummary = {
        totalApiCalls: 0,
        totalApiErrors: 0,
        totalSyncRuns: 0,
        totalRecordsSynced: 0,
        totalWebhooksReceived: 0,
        totalWebhooksDelivered: 0,
        totalRateLimitHits: 0,
        avgErrorRate: 0,
        rows,
      };
      for (const r of rows) {
        summary.totalApiCalls += r.api_calls;
        summary.totalApiErrors += r.api_errors;
        summary.totalSyncRuns += r.sync_runs;
        summary.totalRecordsSynced += r.records_synced;
        summary.totalWebhooksReceived += r.webhooks_received;
        summary.totalWebhooksDelivered += r.webhooks_delivered;
        summary.totalRateLimitHits += r.rate_limit_hits;
      }
      summary.avgErrorRate = summary.totalApiCalls > 0
        ? summary.totalApiErrors / summary.totalApiCalls
        : 0;
      return summary;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching analytics.", {
        workspaceId: input.workspaceId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Connectors
  // -----------------------------------------------------------------------

  /**
   * List connector definitions known to the registry. When
   * `onlyConfigured` is true, only connectors whose env vars are set
   * are returned.
   */
  async listConnectors(options?: ListConnectorsOptions): Promise<ConnectorDefinition[]> {
    ensureRegistered();
    const all = options?.onlyConfigured
      ? connectorRegistry.listConfigured()
      : connectorRegistry.list();
    if (options?.category) {
      return all.filter((c) => c.category === options.category);
    }
    return all;
  }
}

// ---------------------------------------------------------------------------
// Singleton + DI
// ---------------------------------------------------------------------------

let _svc: IntegrationService | null = null;

/** Get the shared integration service (singleton). */
export function getIntegrationService(): IntegrationService {
  if (_svc) return _svc;
  _svc = new IntegrationService(createSupabaseAdminClient());
  return _svc;
}

/** Get an integration service bound to a specific admin client (tests / DI). */
export function getIntegrationServiceWith(supabase: AdminSupabaseClient): IntegrationService {
  return new IntegrationService(supabase);
}

// Re-export commonly-used helpers so callers have them in one place.
export { HEALTH_RATE_LIMIT_WINDOW_MIN, toAppError };
