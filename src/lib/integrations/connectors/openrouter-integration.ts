/**
 * Supa AI — Phase 10 Connector — OpenRouter.
 *
 * Wraps the existing AI provider registry so the Integration Hub can
 * treat every AI provider as a connector with a uniform contract.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/openrouter-integration
 */
import "server-only";

import { connectorRegistry } from "./registry";
import {
  BaseConnector,
  checkEnvConfigured,
  defineConnector,
} from "./base";
import type {
  ConnectorDefinition,
  ConnectorHealthResult,
} from "../types";

const ENV_VARS = ["OPENROUTER_API_KEY"];

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "openrouter",
  name: "OpenRouter",
  category: "ai_provider",
  authType: "api_key",
  capabilities: ["chat"],
  description: "Connect to OpenRouter for AI completions.",
});

class OpenrouterIntegrationConnector extends BaseConnector {
  getDefinition(): ConnectorDefinition {
    return DEFINITION;
  }

  isConfigured(): boolean {
    return checkEnvConfigured(ENV_VARS);
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return this.measureHealth(async () => {
      if (!this.isConfigured()) {
        return { ok: false, message: "OPENROUTER_API_KEY is not set." };
      }
      // The underlying provider is exercised lazily on first chat call.
      // Treat "configured" as healthy; the AI provider registry handles
      // failover when an upstream call fails.
      return { ok: true, message: "configured" };
    });
  }
}

connectorRegistry.register({
  key: DEFINITION.key,
  factory: () => new OpenrouterIntegrationConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { OpenrouterIntegrationConnector };
