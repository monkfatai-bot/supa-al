/**
 * Trigger Registry — extensible registry for workflow triggers.
 * New triggers can be registered without modifying the core engine.
 */

import type { TriggerHandler, TriggerRegistration, TriggerType, TriggerEvent } from "../types";
import { logger } from "@/services/logger";

class TriggerRegistry {
  private handlers = new Map<string, TriggerHandler>();

  /**
   * Register a trigger handler for one or more event names.
   */
  register(registration: TriggerRegistration): void {
    const { eventName, handler } = registration;
    this.handlers.set(eventName, handler);
    logger.info("Automation trigger registered", { eventName });
  }

  /**
   * Unregister a trigger handler by event name.
   */
  unregister(eventName: string): void {
    this.handlers.delete(eventName);
  }

  /**
   * Get a registered handler by event name.
   */
  getHandler(eventName: string): TriggerHandler | undefined {
    return this.handlers.get(eventName);
  }

  /**
   * Check if a handler exists for the given event name.
   */
  has(eventName: string): boolean {
    return this.handlers.has(eventName);
  }

  /**
   * List all registered event names.
   */
  listEventNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Find and execute the handler for a given event.
   * Returns the resulting events (for chained execution).
   */
  async dispatch(event: TriggerEvent): Promise<TriggerEvent[]> {
    const handler = this.handlers.get(event.eventName);
    if (!handler) {
      logger.debug("No trigger handler found for event", { eventName: event.eventName });
      return [];
    }

    if (!handler.canHandle(event.eventName)) {
      logger.warn("Trigger handler cannot handle event", { eventName: event.eventName });
      return [];
    }

    try {
      const results = await handler.handle(event);
      logger.info("Trigger dispatched successfully", {
        eventName: event.eventName,
        resultCount: results.length,
      });
      return results;
    } catch (error) {
      logger.error("Trigger handler failed", {
        eventName: event.eventName,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get all supported event names grouped by trigger type.
   */
  getEventsByType(): Record<TriggerType, string[]> {
    const grouped: Record<string, string[]> = {
      event: [],
      schedule: [],
      manual: [],
      webhook: [],
      api: [],
    };

    for (const eventName of this.handlers.keys()) {
      // Determine trigger type based on event name conventions
      if (eventName.startsWith("schedule.")) {
        grouped.schedule.push(eventName);
      } else if (eventName.startsWith("webhook.")) {
        grouped.webhook.push(eventName);
      } else if (eventName.startsWith("manual.")) {
        grouped.manual.push(eventName);
      } else if (eventName.startsWith("api.")) {
        grouped.api.push(eventName);
      } else {
        grouped.event.push(eventName);
      }
    }

    return grouped as Record<TriggerType, string[]>;
  }
}

/** Singleton trigger registry instance. */
export const triggerRegistry = new TriggerRegistry();