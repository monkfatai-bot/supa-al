/**
 * Supa AI — Phase 10 Connector — Google Drive.
 *
 * OAuth2-based connector. Authorization-code flow is orchestrated by
 * {@link OAuthManager}; this class supplies the provider-specific
 * endpoints + env-var lookup.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/google-drive
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

const CLIENT_ID_ENV = "GOOGLE_OAUTH_CLIENT_ID";
const CLIENT_SECRET_ENV = "GOOGLE_OAUTH_CLIENT_SECRET";
const ENV_VARS = [CLIENT_ID_ENV, CLIENT_SECRET_ENV];

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "google-drive",
  name: "Google Drive",
  category: "storage",
  authType: "oauth2",
  capabilities: ["files","folders"],
  description: "Connect Google Drive to upload, share, and search files.",
});

class GoogleDriveConnector extends BaseConnector {
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
  factory: () => new GoogleDriveConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { GoogleDriveConnector };
