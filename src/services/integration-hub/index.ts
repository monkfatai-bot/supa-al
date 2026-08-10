/**
 * Integration Hub — barrel exports
 *
 * NOTE: webhook-engine, oauth-manager, and api-key-manager are NOT re-exported
 * here because they use node:crypto. Client components should import
 * these functions from ./actions.ts (which wraps them) or from
 * @/services/integration-hub (this barrel). Server-only code may import
 * the submodules directly.
 */

// Central actions (safe for client components)
export {
  listIntegrations,
  getIntegration,
  connectIntegration,
  disconnectIntegration,
  updateIntegrationConfig,
  testConnection,
  getIntegrationHealth,
  listConnectedAccounts,
  getIntegrationLogs,
  getIntegrationPermissions,
  updateIntegrationPermissions,
  getUsageAnalytics,
  refreshIntegrationToken,
  getIntegrationAccountClient,
} from "./actions";

// Event bus (no crypto dependency, safe for re-export)
export {
  publishEvent,
  subscribeToEvent,
  unsubscribeFromEvent,
  listSubscriptions,
  getEventLog,
  replayEvent,
} from "./event-bus";

// Module bridge — cross-module event definitions and subscriptions
export { ModuleEvents, builtinSubscriptions, emitModuleEvent, registerModuleSubscriptions } from "./module-bridge";
export type { ModuleSubscription, ModuleEventType } from "./module-bridge";

// Types
export type * from "./types";

// Capability registry
export {
  listCapabilities,
  getIntegrationCapabilities,
  findIntegrationsByCapability,
  discoverCapabilitiesForWorkspace,
} from "./capability-registry";

// Workspace permissions
export {
  getWorkspaceIntegrationPermissions,
  setWorkspaceIntegrationPermissions,
  checkIntegrationAccess,
  enableIntegration,
  disableIntegration,
  listWorkspacePermissions,
} from "./workspace-permissions";

// OAuth lifecycle
export {
  monitorTokenExpiry,
  autoRefreshExpiredTokens,
  getOAuthLifecycleStatus,
  getTokenAuditHistory,
  scheduleReAuthentication,
} from "./oauth-lifecycle";

// Webhook reliability
export {
  getDeadLetterQueue,
  replayDeadLetterEvent,
  replayAllDeadLetters,
  getDeliveryHistory,
  deliverWithIdempotency,
} from "./webhook-reliability";
export type { DeadLetterEntry } from "./webhook-reliability";

// Health scorer
export {
  calculateHealthScore,
  getHealthScore,
  getAllHealthScores,
  refreshAllHealthScores,
} from "./health-scorer";
export type { HealthScoreRecord, HealthFactors, HealthStatus } from "./health-scorer";

// Integration analytics
export {
  recordUsage,
  getAnalytics,
  getIntegrationSummary,
  getWorkspaceOverview,
  getDailyUsage,
  exportAnalyticsCsv,
} from "./integration-analytics";

// Publisher verification
export {
  createPublisherProfile,
  getPublisherProfile,
  listPublishers,
  submitVerificationRequest,
  getPublisherAnalytics,
  getPublisherItems,
} from "./publisher-verification";

// Extension lifecycle
export {
  installExtension,
  updateExtension,
  rollbackExtension,
  enableExtension,
  disableExtension,
  uninstallExtension,
  checkForUpdates,
  getInstalledExtensions,
  pinVersion,
  unpinVersion,
} from "./extension-lifecycle";

// Compatibility manager
export {
  getPlatformVersion,
  checkCompatibility,
  validateDependencies,
  getCompatibleItems,
} from "./compatibility-manager";

// SDK manager
export {
  publishSdkPackage,
  getSdkPackages,
  getSdkPackage,
  validateManifest,
  getPopularSdkPackages,
  getSdkInstallCommand,
} from "./sdk-manager";

// AI intelligence
export {
  discoverProviders,
  selectBestProvider,
  getFallbackProviders,
  recordProviderUsage,
  getProviderRecommendations,
  explainProviderSelection,
} from "./ai-intelligence";
export type {
  ProviderCandidate,
  SelectOptions,
  ProviderRecommendation,
  SelectionExplanation,
} from "./ai-intelligence";