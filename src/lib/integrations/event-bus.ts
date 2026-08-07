/**
 * Supa AI — Phase 10 Integration Hub — internal Event Bus.
 *
 * Lightweight in-process pub/sub backed by the `integration_events`
 * Postgres table. Every published event is persisted (for replay) and
 * synchronously dispatched to in-process subscribers (for real-time
 * fan-out across internal modules: Chat, AI Employees, Automation, CRM,
 * ERP, Workspace, Billing, Notifications, Search, KB, Reports).
 *
 * Dispatch is best-effort: a throwing subscriber is logged but does not
 * abort the dispatch. Persistence is best-effort too: a persistence
 * failure is logged but the in-memory dispatch still happens.
 *
 * @module @/lib/integrations/event-bus
 */
import "server-only";

import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/types";

import { toDbError, wrapIntegrationError } from "./core";
import { IntegrationEvents } from "./types";
import type {
  EventBusSubscriber,
  IntegrationEvent,
  IntegrationEventCategory,
  IntegrationEventInsert,
} from "./types";

// ---------------------------------------------------------------------------
// Default list-options caps
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

/**
 * Server-only event bus. Construct via {@link eventBus} (the singleton)
 * or {@link getEventBusWith} (DI for tests).
 */
export class EventBus {
  private readonly subscribers = new Map<string, Set<EventBusSubscriber>>();
  private readonly wildcardSubscribers = new Set<EventBusSubscriber>();

  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Subscribe to events of `type`. When `type` is `*`, the subscriber
   * is invoked for every published event regardless of its type. Returns
   * an unsubscribe function.
   */
  subscribe(type: string, subscriber: EventBusSubscriber): () => void {
    if (type === "*") {
      this.wildcardSubscribers.add(subscriber);
      return () => this.wildcardSubscribers.delete(subscriber);
    }
    let set = this.subscribers.get(type);
    if (!set) {
      set = new Set();
      this.subscribers.set(type, set);
    }
    set.add(subscriber);
    return () => {
      set?.delete(subscriber);
    };
  }

  /**
   * Publish an event: persist it to `integration_events` (best-effort)
   * and dispatch it to every in-process subscriber (best-effort).
   */
  async publish(input: {
    workspaceId?: string | null;
    source: string;
    type: string;
    category?: IntegrationEventCategory;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    deliveredTo?: string[];
  }): Promise<IntegrationEvent | null> {
    const eventRow = await this.persist(input);
    const event = eventRow ?? this.synthEvent(input);
    await this.dispatch(event);
    return eventRow;
  }

  /**
   * Dispatch an already-persisted event to in-process subscribers.
   * Used during replay or when the event was inserted by a different
   * process but the local subscribers still need to act on it.
   */
  async dispatch(event: IntegrationEvent): Promise<void> {
    const subscribers = this.subscribers.get(event.type);
    const targets: EventBusSubscriber[] = subscribers
      ? [...subscribers, ...this.wildcardSubscribers]
      : [...this.wildcardSubscribers];

    if (targets.length === 0) return;

    await Promise.all(
      targets.map(async (sub) => {
        try {
          await sub(event);
        } catch (err) {
          logger.warn("event-bus: subscriber threw", {
            eventType: event.type,
            source: event.source,
            error: String(err),
          });
        }
      }),
    );
  }

  /**
   * List events for a workspace (or system-level when `workspaceId` is
   * null), newest-first. Optional `source` / `type` / `category` filters.
   */
  async list(input: {
    workspaceId?: string | null;
    source?: string;
    type?: string;
    category?: IntegrationEventCategory;
    limit?: number;
    offset?: number;
  }): Promise<IntegrationEvent[]> {
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, input.offset ?? 0);

    try {
      let query = this.supabase
        .from("integration_events")
        .select()
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (input.workspaceId === null) {
        query = query.is("workspace_id", null);
      } else if (input.workspaceId) {
        query = query.eq("workspace_id", input.workspaceId);
      }
      if (input.source) query = query.eq("source", input.source);
      if (input.type) query = query.eq("type", input.type);
      if (input.category) query = query.eq("category", input.category);

      const { data, error } = await query;
      if (error) throw toDbError(error, "eventBus.list failed");
      return (data ?? []) as unknown as IntegrationEvent[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing events.");
    }
  }

  /**
   * Replay historical events to in-process subscribers. Fetches events
   * newer than `since` (inclusive) and dispatches each in order.
   * Returns the number of events dispatched.
   */
  async replay(input: {
    workspaceId?: string | null;
    since?: string;
    limit?: number;
  }): Promise<number> {
    try {
      let query = this.supabase
        .from("integration_events")
        .select()
        .order("created_at", { ascending: true })
        .limit(Math.max(1, Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT)));

      if (input.workspaceId === null) {
        query = query.is("workspace_id", null);
      } else if (input.workspaceId) {
        query = query.eq("workspace_id", input.workspaceId);
      }
      if (input.since) query = query.gte("created_at", input.since);

      const { data, error } = await query;
      if (error) throw toDbError(error, "eventBus.replay failed");
      if (!data || data.length === 0) return 0;

      for (const row of data as unknown as IntegrationEvent[]) {
        await this.dispatch(row);
      }
      return data.length;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure replaying events.");
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async persist(input: {
    workspaceId?: string | null;
    source: string;
    type: string;
    category?: IntegrationEventCategory;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    deliveredTo?: string[];
  }): Promise<IntegrationEvent | null> {
    const row: TablesInsert<"integration_events"> = {
      workspace_id: input.workspaceId ?? null,
      source: input.source,
      type: input.type,
      category: input.category ?? "integration",
      payload: (input.payload ?? {}) as unknown as IntegrationEventInsert["payload"],
      metadata: (input.metadata ?? {}) as unknown as IntegrationEventInsert["metadata"],
      delivered_to: (input.deliveredTo ?? []) as unknown as IntegrationEventInsert["delivered_to"],
    };

    try {
      const { data, error } = await this.supabase
        .from("integration_events")
        .insert(row as never)
        .select()
        .single();
      if (error) {
        logger.warn("event-bus: persist failed; dispatching in-memory only", {
          source: input.source,
          type: input.type,
          error: String(error),
        });
        return null;
      }
      return data as unknown as IntegrationEvent;
    } catch (err) {
      logger.warn("event-bus: persist threw; dispatching in-memory only", {
        source: input.source,
        type: input.type,
        error: String(err),
      });
      return null;
    }
  }

  /** Build an ephemeral event shape (no `id` / `created_at` from DB). */
  private synthEvent(input: {
    workspaceId?: string | null;
    source: string;
    type: string;
    category?: IntegrationEventCategory;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    deliveredTo?: string[];
  }): IntegrationEvent {
    const now = new Date().toISOString();
    return {
      id: `ephemeral-${now}-${Math.random().toString(36).slice(2, 8)}`,
      workspace_id: input.workspaceId ?? null,
      source: input.source,
      type: input.type,
      category: input.category ?? "integration",
      payload: (input.payload ?? {}) as unknown as IntegrationEvent["payload"],
      metadata: (input.metadata ?? {}) as unknown as IntegrationEvent["metadata"],
      delivered_to: (input.deliveredTo ?? []) as unknown as IntegrationEvent["delivered_to"],
      created_at: now,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _bus: EventBus | null = null;

/** Get the shared event bus (singleton). */
export function getEventBus(): EventBus {
  if (_bus) return _bus;
  _bus = new EventBus(createSupabaseAdminClient());
  return _bus;
}

/** Get an event bus bound to a specific admin client (tests / DI). */
export function getEventBusWith(supabase: AdminSupabaseClient): EventBus {
  return new EventBus(supabase);
}

/** Convenience singleton alias for {@link getEventBus}. */
export const eventBus: EventBus = new Proxy({} as EventBus, {
  get(_t, prop) {
    return Reflect.get(getEventBus(), prop);
  },
});

// Re-export the canonical event names so callers can subscribe via
// `eventBus.subscribe(IntegrationEvents.workflowRunCompleted, handler)`.
export { IntegrationEvents };
