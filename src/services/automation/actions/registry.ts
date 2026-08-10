/**
 * Action Registry — extensible registry for workflow actions.
 * New actions can be registered without modifying the core engine.
 */

import type { ActionHandler, ActionRegistration, ActionType, ActionContext, ActionHandlerResult } from "../types";
import type { Json } from "@/types/generated/database";
import { logger } from "@/services/logger";

class ActionRegistry {
  private handlers = new Map<string, ActionHandler>();

  /**
   * Register an action handler.
   */
  register(registration: ActionRegistration): void {
    this.handlers.set(registration.type, registration.handler);
    logger.info("Automation action registered", { type: registration.type });
  }

  /**
   * Unregister an action handler.
   */
  unregister(type: ActionType): void {
    this.handlers.delete(type);
  }

  /**
   * Get a registered handler by action type.
   */
  getHandler(type: ActionType): ActionHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Check if a handler exists for the given action type.
   */
  has(type: ActionType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Validate an action's configuration using its handler's validate method.
   */
  validate(type: ActionType, config: unknown): string | null {
    const handler = this.handlers.get(type);
    if (!handler) return `Unknown action type: ${type}`;
    if (handler.validate) return handler.validate(config as Json);
    return null;
  }

  /**
   * Execute an action by type with the given config and context.
   */
  async execute(
    type: ActionType,
    config: unknown,
    context: ActionContext,
  ): Promise<ActionHandlerResult> {
    const handler = this.handlers.get(type);
    if (!handler) {
      return {
        success: false,
        error: `Unknown action type: ${type}`,
        shouldRetry: false,
      };
    }

    try {
      const result = await handler.execute(config as Json, context);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Action execution failed", { type, error: message, runId: context.runId });
      return {
        success: false,
        error: message,
        shouldRetry: true,
      };
    }
  }

  /**
   * List all registered action types.
   */
  listTypes(): ActionType[] {
    return Array.from(this.handlers.keys()) as ActionType[];
  }
}

/** Singleton action registry instance. */
export const actionRegistry = new ActionRegistry();
