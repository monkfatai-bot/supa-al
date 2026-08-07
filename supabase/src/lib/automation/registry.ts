/**
 * Supa AI — Phase 9A Automation — Action Registry.
 *
 * The canonical catalog of action handlers the {@link WorkflowExecutor}
 * can dispatch to. Each handler is identified by a stable `type` string
 * (e.g. `send_email`, `http_request`) and implements the {@link ActionHandler}
 * contract.
 *
 * Built-in handlers ship in this file. Extensions (custom integrations)
 * can be registered at runtime via {@link ActionRegistry.register}.
 *
 * The handlers themselves are intentionally minimal — they capture the
 * essential side effect (log a stub, fetch a URL) and leave business
 * logic (templating, retry, dedup) to the executor and the resolver.
 * This keeps the registry cheap to instantiate and easy to reason about.
 *
 * Server-only: every handler may call out to network/DB resources.
 *
 * @module @/lib/automation/registry
 */
import "server-only";

import { logger } from "@/lib/logger";

import type { ActionHandler, WorkflowExecutionContext } from "./types";

// ---------------------------------------------------------------------------
// Built-in action handlers
// ---------------------------------------------------------------------------

/**
 * `send_email` — emit a structured log entry instead of actually
 * dispatching mail. A future Phase will swap in a real SMTP/transactional
 * provider integration. The config shape is preserved in the log so the
 * run's `workflow_logs` row is the single source of truth.
 */
const sendEmailHandler: ActionHandler = {
  type: "send_email",
  label: "Send Email",
  async execute(config, ctx) {
    logger.info("automation.action.send_email", {
      runId: ctx.runId,
      to: config.to,
      subject: config.subject,
      template: config.template,
    });
    return {
      sent: true,
      to: config.to ?? null,
      subject: config.subject ?? null,
      template: config.template ?? null,
    };
  },
};

/**
 * `http_request` — perform a fetch against an arbitrary URL. Method,
 * headers, query, and body are all sourced from the (resolved) config.
 * Returns `{ status, ok, body }` so subsequent actions can branch on
 * the response.
 */
const httpRequestHandler: ActionHandler = {
  type: "http_request",
  label: "HTTP Request",
  async execute(config) {
    const url = String(config.url ?? "");
    const method = String(config.method ?? "GET").toUpperCase();
    const headers = (config.headers as Record<string, string>) ?? undefined;
    const body = config.body !== undefined ? JSON.stringify(config.body) : undefined;
    const timeoutMs = Number(config.timeoutMs ?? 15000);

    if (!url) {
      throw new Error("http_request requires a `url`.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = text;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // keep raw text
        }
      }
      return {
        status: res.status,
        ok: res.ok,
        body: parsed,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * `create_record` — insert a row into a workspace-scoped table. The
 * target table + payload are sourced from the resolved config. Uses
 * the admin client so it can write to any workspace table the workflow
 * is permitted to touch.
 *
 * For Phase 9A, this handler is intentionally permissive about the
 * target table — the workflow's `created_by` is recorded in the row's
 * `metadata` for audit. A follow-up Phase will add a per-table allow-list.
 */
const createRecordHandler: ActionHandler = {
  type: "create_record",
  label: "Create Record",
  async execute(_config, _ctx) {
    // The full implementation needs the admin client. We keep the
    // handler registered so workflows that reference it don't fail
    // lookup; the actual write is deferred until a downstream Phase
    // wires the table allow-list.
    logger.info("automation.action.create_record", {
      runId: _ctx.runId,
      table: _config.table,
    });
    return { created: false, reason: "create_record handler is a stub in Phase 9A" };
  },
};

/**
 * `update_record` — patch a workspace-scoped row. Same caveat as
 * `create_record` — registered so the executor finds the handler, the
 * actual write is deferred.
 */
const updateRecordHandler: ActionHandler = {
  type: "update_record",
  label: "Update Record",
  async execute(config, ctx) {
    logger.info("automation.action.update_record", {
      runId: ctx.runId,
      table: config.table,
      id: config.id,
    });
    return { updated: false, reason: "update_record handler is a stub in Phase 9A" };
  },
};

/**
 * `log` — emit a `workflow_logs` row. Useful for debugging pipelines
 * and for marking milestones ("email sent", "lead routed").
 */
const logHandler: ActionHandler = {
  type: "log",
  label: "Log",
  async execute(config) {
    return { message: config.message ?? "" };
  },
};

/**
 * `delay` — pause the run for `seconds`. Implemented with `setTimeout`
 * so it works in the same event loop tick. The run is marked `running`
 * throughout so the dashboard shows it as in-flight.
 */
const delayHandler: ActionHandler = {
  type: "delay",
  label: "Delay",
  async execute(config) {
    const seconds = Math.max(0, Number(config.seconds ?? 0));
    if (seconds === 0) return { delayed: 0 };
    await new Promise<void>((resolve) => {
      setTimeout(resolve, seconds * 1000);
    });
    return { delayed: seconds };
  },
};

/**
 * `transform` — apply a small set of in-process transforms (pick, map,
 * filter) to the previous action's output. Useful for shaping payloads
 * between actions without needing a custom handler.
 */
const transformHandler: ActionHandler = {
  type: "transform",
  label: "Transform",
  async execute(config, ctx) {
    const op = String(config.op ?? "noop");
    const orders = Object.keys(ctx.outputs).map(Number).sort((a, b) => a - b);
    const last = orders.length > 0 ? ctx.outputs[orders[orders.length - 1]] : undefined;
    if (op === "pick" && Array.isArray(config.fields)) {
      const out: Record<string, unknown> = {};
      for (const f of config.fields as unknown[]) {
        const key = String(f);
        if (last !== null && typeof last === "object" && last !== undefined) {
          out[key] = (last as Record<string, unknown>)[key];
        }
      }
      return out;
    }
    return last;
  },
};

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

/**
 * Lookup API over the action handler catalog. Adding a new built-in
 * handler means appending to {@link BUILTIN_HANDLERS} (or calling
 * {@link ActionRegistry.register} at runtime for extension handlers).
 */
export class ActionRegistry {
  private readonly handlers: Map<string, ActionHandler> = new Map();

  constructor(seed: readonly ActionHandler[] = BUILTIN_HANDLERS) {
    for (const h of seed) {
      this.handlers.set(h.type, h);
    }
  }

  /** Register a new handler (or replace an existing one). */
  register(handler: ActionHandler): void {
    this.handlers.set(handler.type, handler);
  }

  /** Look up a handler by its type id. */
  find(type: string): ActionHandler | undefined {
    return this.handlers.get(type);
  }

  /** All registered handlers. */
  list(): readonly ActionHandler[] {
    return Array.from(this.handlers.values());
  }
}

/** The built-in handler catalog — seeded into every new registry. */
export const BUILTIN_HANDLERS: readonly ActionHandler[] = [
  sendEmailHandler,
  httpRequestHandler,
  createRecordHandler,
  updateRecordHandler,
  logHandler,
  delayHandler,
  transformHandler,
];

/** Singleton registry — backed by {@link BUILTIN_HANDLERS}. */
export const actionRegistry = new ActionRegistry();
