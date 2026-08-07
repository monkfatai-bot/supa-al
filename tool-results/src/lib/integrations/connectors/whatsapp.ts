/**
 * Supa AI — Phase 10 Connector — WhatsApp.
 *
 * API-key-based connector. Health check verifies the env var is set;
 * the actual API call is made by the connector when invoked.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/whatsapp
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

const API_KEY_ENV = "WHATSAPP_API_KEY";
const ENV_VARS = [API_KEY_ENV];

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "whatsapp",
  name: "WhatsApp",
  category: "communication",
  authType: "api_key",
  capabilities: ["messages"],
  description: "Connect WhatsApp Business to send and receive messages.",
});

class WhatsappConnector extends BaseConnector {
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
  factory: () => new WhatsappConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { WhatsappConnector };
