/**
 * Supa AI — Phase 10 Connector — Google AI.
 *
 * Wraps the existing AI provider registry so the Integration Hub can
 * treat every AI provider as a connector with a uniform contract.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/gemini-integration
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

const ENV_VARS = ["GOOGLE_GENERATIVE_AI_API_KEY"];

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "gemini",
  name: "Google AI",
  category: "ai_provider",
  authType: "api_key",
  capabilities: ["chat"],
  description: "Connect to Google AI for AI completions.",
});

class GeminiIntegrationConnector extends BaseConnector {
  getDefinition(): ConnectorDefinition {
    return DEFINITION;
  }

  isConfigured(): boolean {
    return checkEnvConfigured(ENV_VARS);
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return this.measureHealth(async () => {
      if (!this.isConfigured()) {
        return { ok: false, message: "GOOGLE_GENERATIVE_AI_API_KEY is not set." };
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
  factory: () => new GeminiIntegrationConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { GeminiIntegrationConnector };
