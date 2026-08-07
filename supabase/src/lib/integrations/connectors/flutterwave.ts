/**
 * Supa AI — Phase 10 Connector — Flutterwave.
 *
 * API-key-based connector. Health check verifies the env var is set;
 * the actual API call is made by the connector when invoked.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/flutterwave
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

const API_KEY_ENV = "FLUTTERWAVE_SECRET_KEY";
const ENV_VARS = [API_KEY_ENV];

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "flutterwave",
  name: "Flutterwave",
  category: "payments",
  authType: "api_key",
  capabilities: ["payments"],
  description: "Connect Flutterwave to accept payments across Africa.",
});

class FlutterwaveConnector extends BaseConnector {
  getDefinition(): ConnectorDefinition {
    return DEFINITION;
  }

  isConfigured(): boolean {
    return checkEnvConfigured(ENV_VARS);
  }

  /** Read the API key from env (used by the credential vault fallback). */
  getApiKey(): string {
    return readEnv(API_KEY_ENV);
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return this.measureHealth(async () => {
      if (!this.isConfigured()) {
        return { ok: false, message: `${API_KEY_ENV} is not set.` };
      }
      return { ok: true, message: "configured" };
    });
  }
}

connectorRegistry.register({
  key: DEFINITION.key,
  factory: () => new FlutterwaveConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { FlutterwaveConnector };
