/**
 * Supa AI — Phase 10 Connector — OneDrive.
 *
 * OAuth2-based connector. Authorization-code flow is orchestrated by
 * {@link OAuthManager}; this class supplies the provider-specific
 * endpoints + env-var lookup.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/onedrive
 */
import "server-only";

import { connectorRegistry } from "./registry";
import {
  BaseConnector,
  checkEnvConfigured,
  defineConnector,
  readEnv,
} from "./base";
import type {
  ConnectorDefinition,
  ConnectorHealthResult,
} from "../types";

const CLIENT_ID_ENV = "ONEDRIVE_CLIENT_ID";
const CLIENT_SECRET_ENV = "ONEDRIVE_CLIENT_SECRET";
const ENV_VARS = [CLIENT_ID_ENV, CLIENT_SECRET_ENV];

const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const REVOKE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/logout";

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "onedrive",
  name: "OneDrive",
  category: "storage",
  authType: "oauth2",
  capabilities: ["files","folders"],
  description: "Connect OneDrive to manage files and folders.",
});

class OnedriveConnector extends BaseConnector {
  getDefinition(): ConnectorDefinition {
    return DEFINITION;
  }

  isConfigured(): boolean {
    return checkEnvConfigured(ENV_VARS);
  }

  getClientId(): string {
    return readEnv(CLIENT_ID_ENV);
  }

  protected getClientSecret(): string {
    return readEnv(CLIENT_SECRET_ENV);
  }

  getAuthorizeUrl(): string {
    return AUTHORIZE_URL;
  }

  protected getTokenUrl(): string {
    return TOKEN_URL;
  }

  protected getRevokeUrl(): string {
    return REVOKE_URL;
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return this.measureHealth(async () => {
      if (!this.isConfigured()) {
        return { ok: false, message: `${CLIENT_ID_ENV} / ${CLIENT_SECRET_ENV} not set.` };
      }
      return { ok: true, message: "configured" };
    });
  }
}

connectorRegistry.register({
  key: DEFINITION.key,
  factory: () => new OnedriveConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { OnedriveConnector };
