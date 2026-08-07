/**
 * Supa AI — Phase 10 Integration Hub — full barrel (server-only).
 *
 * Re-exports the client-safe types *plus* the server-only services,
 * managers, and engine. Importing this barrel from a Client Component
 * will throw at build time — client code MUST import from
 * `@/lib/integrations/client` instead.
 *
 * @module @/lib/integrations
 */
import "server-only";

export * from "./client";

export {
  assertIntegrationAccess,
  assertIntegrationAdmin,
  computeRetryDelay,
  generateWebhookSlug,
  isoInFuture,
  wrapIntegrationError,
} from "./core";

export {
  CredentialVault,
  getCredentialVault,
  getCredentialVaultWith,
} from "./credential-vault";

export {
  EventBus,
  eventBus,
  getEventBus,
  getEventBusWith,
} from "./event-bus";

export {
  OAuthManager,
  getOAuthManager,
  getOAuthManagerWith,
} from "./oauth-manager";

export {
  WebhookManager,
  getWebhookManager,
  getWebhookManagerWith,
} from "./webhook-manager";

export {
  SyncEngine,
  getSyncEngine,
  getSyncEngineWith,
} from "./sync-engine";

export {
  IntegrationService,
  getIntegrationService,
  getIntegrationServiceWith,
} from "./integration-service";

export {
  MarketplaceService,
  getMarketplaceService,
  getMarketplaceServiceWith,
} from "./marketplace-service";

export {
  initializeInternalModuleIntegration,
} from "./internal-modules";

export {
  BaseConnector,
  BaseConnectorFactory,
  defineConnector,
} from "./connectors/base";

export {
  ConnectorRegistry,
  connectorRegistry,
  ensureRegistered,
} from "./connectors/registry";
