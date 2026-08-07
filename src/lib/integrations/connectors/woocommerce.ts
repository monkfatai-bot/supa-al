/**
 * Supa AI — Phase 10 Connector — WooCommerce.
 *
 * Basic-auth connector (username + password / API key pair). Health
 * check verifies both env vars are set.
 *
 * Server-only.
 *
 * @module @/lib/integrations/connectors/woocommerce
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

const USER_ENV = "WOOCOMMERCE_CONSUMER_KEY";
const PASS_ENV = "WOOCOMMERCE_CONSUMER_SECRET";
const ENV_VARS = [USER_ENV, PASS_ENV];

const DEFINITION: ConnectorDefinition = defineConnector({
  key: "woocommerce",
  name: "WooCommerce",
  category: "commerce",
  authType: "basic",
  capabilities: ["orders","products"],
  description: "Connect WooCommerce to manage products and orders.",
});

class WoocommerceConnector extends BaseConnector {
  getDefinition(): ConnectorDefinition {
    return DEFINITION;
  }

  isConfigured(): boolean {
    return checkEnvConfigured(ENV_VARS);
  }

  getUsername(): string {
    return readEnv(USER_ENV);
  }

  getPassword(): string {
    return readEnv(PASS_ENV);
  }

  async healthCheck(): Promise<ConnectorHealthResult> {
    return this.measureHealth(async () => {
      if (!this.isConfigured()) {
        return { ok: false, message: `${USER_ENV} / ${PASS_ENV} not set.` };
      }
      return { ok: true, message: "configured" };
    });
  }
}

connectorRegistry.register({
  key: DEFINITION.key,
  factory: () => new WoocommerceConnector(),
  isConfigured: () => checkEnvConfigured(ENV_VARS),
  definition: DEFINITION,
});

export { WoocommerceConnector };
