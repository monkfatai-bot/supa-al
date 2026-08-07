/**
 * Supa AI — Phase 10 Connector — Qwen.
 *
 * Wraps the existing AI provider registry so the Integration Hub can
 * treat every AI provider as a connector with a uniform contract.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/qwen-integration
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

const ENV_VARS = ["QWEN_API_KEY"];

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "qwen",
  name: "Qwen",
  category: "ai_provider",
  authType: "api_key",
  capabilities: ["chat"],
  description: "Connect to Qwen for AI completions.",
});

class QwenIntegrationConnector extends BaseConnector {
  getDefinition(): ConnectorDefinition {
    return DEFINITION;
  }

  isConfigured(): boolean {
    return checkEnvConfigured(ENV_VARS);
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return this.measureHealth(async () => {
      if (!this.isConfigured()) {
        return { ok: false, message: "QWEN_API_KEY is not set." };
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
  factory: () => new QwenIntegrationConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { QwenIntegrationConnector };
