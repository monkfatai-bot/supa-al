/**
 * Supa AI — Phase 10 Connector — Zoom.
 *
 * OAuth2-based connector. Authorization-code flow is orchestrated by
 * {@link OAuthManager}; this class supplies the provider-specific
 * endpoints + env-var lookup.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/zoom
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

const CLIENT_ID_ENV = "ZOOM_CLIENT_ID";
const CLIENT_SECRET_ENV = "ZOOM_CLIENT_SECRET";
const ENV_VARS = [CLIENT_ID_ENV, CLIENT_SECRET_ENV];

const AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";
const REVOKE_URL = "https://zoom.us/oauth/revoke";

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "zoom",
  name: "Zoom",
  category: "communication",
  authType: "oauth2",
  capabilities: ["meetings","recordings"],
  description: "Connect Zoom to manage meetings and webinars.",
});

class ZoomConnector extends BaseConnector {
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
  factory: () => new ZoomConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { ZoomConnector };
