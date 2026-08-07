/**
 * Supa AI — Phase 10 Connector — GitHub.
 *
 * OAuth2-based connector. Authorization-code flow is orchestrated by
 * {@link OAuthManager}; this class supplies the provider-specific
 * endpoints + env-var lookup.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/github
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

const CLIENT_ID_ENV = "GITHUB_CLIENT_ID";
const CLIENT_SECRET_ENV = "GITHUB_CLIENT_SECRET";
const ENV_VARS = [CLIENT_ID_ENV, CLIENT_SECRET_ENV];

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const REVOKE_URL = "https://github.com/settings/connections/applications/${GITHUB_CLIENT_ID}";

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "github",
  name: "GitHub",
  category: "development",
  authType: "oauth2",
  capabilities: ["repos","issues","pulls","actions"],
  description: "Connect GitHub to manage repositories, issues, pull requests, and actions.",
});

class GithubConnector extends BaseConnector {
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
  factory: () => new GithubConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { GithubConnector };
