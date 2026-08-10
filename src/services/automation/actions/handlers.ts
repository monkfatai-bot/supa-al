/*
 * Built-in action handlers for the automation engine.
 * Each handler implements the ActionHandler interface.
 */

import type { ActionHandler } from "../types";
import { logger } from "@/services/logger";
import { actionRegistry } from "./registry";

// ─── Notification Action ──────────────────────────────────────

const sendNotificationHandler: ActionHandler = {
  type: "send_notification",

  execute: async (config, context) => {
    const { title, message, userId } = config as {
      title: string;
      message: string;
      userId?: string;
    };

    if (!title || !message) {
      return { success: false, error: "Notification requires title and message" };
    }

    try {
      const { createNotification } = await import("@/services/notification/actions");
      await createNotification(
        userId ?? context.userId ?? "",
        "workspace",
        title,
        message,
      );

      return { success: true, output: { notified: true, title } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send notification",
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.title) return "title is required";
    if (!c.message) return "message is required";
    return null;
  },
};

// ─── Create Task Action ──────────────────────────────────────

const createTaskHandler: ActionHandler = {
  type: "create_task",

  execute: async (config, context) => {
    const { title, description, projectId, priority, dueDate } = config as {
      title: string;
      description?: string;
      projectId?: string;
      priority?: string;
      dueDate?: string;
    };

    if (!title) {
      return { success: false, error: "Task requires a title" };
    }

    try {
      const { createTask } = await import("@/services/project/actions");
      const result = await createTask({
        workspaceId: context.workspaceId,
        title,
        description: description ?? "",
        projectId: projectId,
        priority: (priority as "low" | "medium" | "high") ?? "medium",
        dueDate: dueDate,
      });

      return { success: result.success, output: { taskId: result.task?.id }, error: result.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create task",
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.title) return "title is required";
    return null;
  },
};

// ─── Delay Action ─────────────────────────────────────────────

const delayHandler: ActionHandler = {
  type: "delay",

  execute: async (config, _context) => {
    void _context;
    const { durationMs } = config as { durationMs: number };
    const ms = typeof durationMs === "number" && durationMs > 0 ? Math.min(durationMs, 300_000) : 1000;

    await new Promise((resolve) => setTimeout(resolve, ms));

    return { success: true, output: { delayed: true, durationMs: ms } };
  },
};

// ─── HTTP Request Action ──────────────────────────────────────

const httpRequestHandler: ActionHandler = {
  type: "http_request",

  execute: async (config, _context) => {
    void _context;
    const { url, method, headers, body, timeoutMs } = config as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
      timeoutMs?: number;
    };

    if (!url) {
      return { success: false, error: "url is required" };
    }

    const timeout = typeof timeoutMs === "number" ? Math.min(timeoutMs, 30000) : 10000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") ?? "";
      let responseData: unknown;
      if (contentType.includes("application/json")) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      return {
        success: response.ok,
        output: {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
        },
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `HTTP request failed: ${message}`,
        shouldRetry: !message.includes("abort"),
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.url || typeof c.url !== "string") return "url is required and must be a string";
    return null;
  },
};

// ─── Webhook Action ───────────────────────────────────────────

const webhookHandler: ActionHandler = {
  type: "webhook",

  execute: async (config, _context) => {
    void _context;
    const { url, payload, headers, method } = config as {
      url: string;
      payload?: unknown;
      headers?: Record<string, string>;
      method?: string;
    };

    if (!url) {
      return { success: false, error: "url is required" };
    }

    try {
      const response = await fetch(url, {
        method: method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      return {
        success: response.ok,
        output: { status: response.status },
        error: response.ok ? undefined : `Webhook failed with status ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Webhook delivery failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    if (!(config as Record<string, unknown>).url) return "url is required";
    return null;
  },
};

// ─── Condition Action ─────────────────────────────────────────

const conditionHandler: ActionHandler = {
  type: "condition",

  execute: async (config, context) => {
    const { conditions, trueBranch, falseBranch } = config as {
      conditions: unknown;
      trueBranch?: string;
      falseBranch?: string;
    };

    const { evaluateCondition } = await import("../conditions");
    const result = evaluateCondition(conditions, context.variables);

    return {
      success: true,
      output: {
        conditionResult: result,
        branch: result ? trueBranch : falseBranch,
      },
    };
  },
};

// ─── Loop Action ──────────────────────────────────────────────

const loopHandler: ActionHandler = {
  type: "loop",

  execute: async (config, _context) => {
    void _context;
    const { items, maxIterations } = config as {
      items: unknown[];
      maxIterations?: number;
    };

    if (!Array.isArray(items)) {
      return { success: false, error: "items must be an array" };
    }

    const max = typeof maxIterations === "number" ? Math.min(maxIterations, 100) : 50;
    const limited = items.slice(0, max);

    return {
      success: true,
      output: {
        iterations: limited.length,
        items: limited,
      },
    };
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.items) return "items is required";
    return null;
  },
};

// ─── AI Chat Action ───────────────────────────────────────────

const aiChatHandler: ActionHandler = {
  type: "ai_chat",

  execute: async (config, _context) => {
    void _context;
    const { prompt, model, systemPrompt } = config as {
      prompt: string;
      model?: string;
      systemPrompt?: string;
    };

    if (!prompt) {
      return { success: false, error: "prompt is required" };
    }

    try {
      const { sendChatMessage } = await import("@/services/ai");
      const result = await sendChatMessage({
        model: model ?? "gpt-4o-mini",
        messages: [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          { role: "user" as const, content: prompt },
        ],
      });

      return { success: true, output: { response: result.content, model: result.model } };
    } catch (error) {
      return {
        success: false,
        error: `AI chat failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    if (!(config as Record<string, unknown>).prompt) return "prompt is required";
    return null;
  },
};

// ─── Update Database Action ───────────────────────────────────

const updateDatabaseHandler: ActionHandler = {
  type: "update_database",

  execute: async (config, _context) => {
    void _context;
    const { table, operation, data, match } = config as {
      table: string;
      operation: "insert" | "update" | "delete";
      data: Record<string, unknown>;
      match?: Record<string, unknown>;
    };

    if (!table || !operation) {
      return { success: false, error: "table and operation are required" };
    }

    // Restrict to allowed tables for security
    const allowedTables = [
      "tasks", "leads", "contacts", "companies", "customers",
      "notifications", "activity_logs", "projects",
    ];
    if (!allowedTables.includes(table)) {
      return { success: false, error: `Table not allowed: ${table}` };
    }

    try {
      const { createServerSupabaseClient } = await import("@/lib/supabase/server-client");
      const supabase = await createServerSupabaseClient();

      let result;
      if (operation === "insert") {
        result = await supabase.from(table).insert(data).select("id").single();
      } else if (operation === "update" && match) {
        let query = supabase.from(table).update(data);
        for (const [key, value] of Object.entries(match)) {
          query = query.eq(key, value);
        }
        result = await query.select("id");
      } else if (operation === "delete" && match) {
        let query = supabase.from(table).delete();
        for (const [key, value] of Object.entries(match)) {
          query = query.eq(key, value);
        }
        result = await query;
      } else {
        return { success: false, error: "Invalid operation or missing match criteria" };
      }

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      return { success: true, output: { operation, table, data: result.data } };
    } catch (error) {
      return {
        success: false,
        error: `Database operation failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.table) return "table is required";
    if (!c.operation) return "operation is required";
    return null;
  },
};

// ─── Update Record Action ──────────────────────────────────────

const updateRecordHandler: ActionHandler = {
  type: "update_database",

  execute: async (config, _context) => {
    void _context;
    const { table, id, updates, workspaceId } = config as {
      table: string;
      id: string;
      updates: Record<string, unknown>;
      workspaceId?: string;
    };

    if (!table || !id || !updates) {
      return { success: false, error: "table, id, and updates are required" };
    }

    try {
      const { createServerSupabaseClient } = await import("@/lib/supabase/server-client");
      const supabase = await createServerSupabaseClient();

      let query = supabase.from(table).update(updates).eq("id", id);
      if (workspaceId) {
        query = query.eq("workspace_id", workspaceId);
      }
      const { data, error } = await query.select("*");

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, output: { updated: true, id, data } };
    } catch (error) {
      return {
        success: false,
        error: `Update record failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.table) return "table is required";
    if (!c.id) return "id is required";
    if (!c.updates) return "updates is required";
    return null;
  },
};

// ─── Create Record Action ──────────────────────────────────────

const createRecordHandler: ActionHandler = {
  type: "custom",

  execute: async (config, _context) => {
    void _context;
    const { table, data } = config as {
      table: string;
      data: Record<string, unknown>;
    };

    if (!table || !data) {
      return { success: false, error: "table and data are required" };
    }

    try {
      const { createServerSupabaseClient } = await import("@/lib/supabase/server-client");
      const supabase = await createServerSupabaseClient();

      const { data: record, error } = await supabase
        .from(table)
        .insert(data)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, output: { created: true, record } };
    } catch (error) {
      return {
        success: false,
        error: `Create record failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.table) return "table is required";
    if (!c.data) return "data is required";
    return null;
  },
};

// ─── AI Generate Action ────────────────────────────────────────

const aiGenerateHandler: ActionHandler = {
  type: "ai_chat",

  execute: async (config, _context) => {
    void _context;
    const { prompt, model, temperature, maxTokens, systemPrompt } = config as {
      prompt: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    };

    if (!prompt) {
      return { success: false, error: "prompt is required" };
    }

    try {
      const { sendChatMessage } = await import("@/services/ai");
      const result = await sendChatMessage({
        model: model ?? "gpt-4o-mini",
        messages: [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          { role: "user" as const, content: prompt },
        ],
        temperature,
        maxTokens,
      });

      return { success: true, output: { text: result.content, model: result.model } };
    } catch (error) {
      return {
        success: false,
        error: `AI generation failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    if (!(config as Record<string, unknown>).prompt) return "prompt is required";
    return null;
  },
};

// ─── Transform Data Action ─────────────────────────────────────

const transformDataHandler: ActionHandler = {
  type: "custom",

  execute: async (config, _context) => {
    void _context;
    const { input, transformations } = config as {
      input: Record<string, unknown>;
      transformations: Array<{ field: string; operation: string; value?: unknown }>;
    };

    if (!input || !transformations) {
      return { success: false, error: "input and transformations are required" };
    }

    try {
      // Deep clone to avoid mutating the original
      const result: Record<string, unknown> = JSON.parse(JSON.stringify(input));

      for (const transform of transformations) {
        switch (transform.operation) {
          case "set": {
            result[transform.field] = transform.value;
            break;
          }
          case "remove": {
            delete result[transform.field];
            break;
          }
          case "rename": {
            const newField = transform.value as string;
            if (newField && transform.field in result) {
              result[newField] = result[transform.field];
              delete result[transform.field];
            }
            break;
          }
          case "template": {
            const template = transform.value as string;
            if (typeof template === "string") {
              result[transform.field] = template.replace(
                /\{\{(\w+)\}\}/g,
                (_, key) => String(result[key] ?? ""),
              );
            }
            break;
          }
          default:
            return { success: false, error: `Unknown transform operation: ${transform.operation}` };
        }
      }

      return { success: true, output: result };
    } catch (error) {
      return {
        success: false,
        error: `Data transform failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.input) return "input is required";
    if (!c.transformations) return "transformations is required";
    return null;
  },
};

// ─── Generate Image Action ─────────────────────────────────────

const generateImageHandler: ActionHandler = {
  type: "generate_image",

  execute: async (config, _context) => {
    void _context;
    const { prompt, width, height, style } = config as {
      prompt: string;
      width?: number;
      height?: number;
      style?: string;
    };

    if (!prompt) {
      return { success: false, error: "prompt is required" };
    }

    try {
      const { generateImageFromProvider } = await import("@/services/image/service");
      const { DEFAULT_IMAGE_SETTINGS } = await import("@/services/image/types");

      // Map dimensions to a supported size string
      let size = DEFAULT_IMAGE_SETTINGS.size;
      if (width && height) {
        size = `${width}x${height}` as typeof size;
      }

      const response = await generateImageFromProvider({
        prompt,
        model: "dall-e-3",
        settings: {
          ...DEFAULT_IMAGE_SETTINGS,
          size,
          style: (style as typeof DEFAULT_IMAGE_SETTINGS.style) ?? DEFAULT_IMAGE_SETTINGS.style,
        },
        generationType: "text-to-image",
      });

      // The first result's base64 can be stored; return a data URL for convenience
      const firstResult = response.results[0];
      const url = firstResult
        ? `data:image/png;base64,${firstResult.imageData}`
        : "";

      return {
        success: true,
        output: { url, provider: response.provider, model: response.model },
      };
    } catch (error) {
      return {
        success: false,
        error: `Image generation failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    if (!(config as Record<string, unknown>).prompt) return "prompt is required";
    return null;
  },
};

// ─── Generate Video Action ─────────────────────────────────────

const generateVideoHandler: ActionHandler = {
  type: "generate_video",

  execute: async (config, _context) => {
    void _context;
    const { prompt, duration, style } = config as {
      prompt: string;
      duration?: number;
      style?: string;
    };

    if (!prompt) {
      return { success: false, error: "prompt is required" };
    }

    // Placeholder — actual video generation will be integrated in Phase 10
    return {
      success: true,
      output: {
        status: "pending" as const,
        message: "Video generation queued for processing",
        prompt,
        duration: duration ?? 5,
        style: style ?? "default",
      },
    };
  },

  validate: (config) => {
    if (!(config as Record<string, unknown>).prompt) return "prompt is required";
    return null;
  },
};

// ─── Generate Voice Action ─────────────────────────────────────

const generateVoiceHandler: ActionHandler = {
  type: "generate_voice",

  execute: async (config, context) => {
    const { text, voice, speed } = config as {
      text: string;
      voice?: string;
      speed?: number;
    };

    if (!text) {
      return { success: false, error: "text is required" };
    }

    try {
      const { submitTTS } = await import("@/services/voice/service");
      const result = await submitTTS(context.userId ?? "", {
        text,
        voiceId: voice,
        speed,
      });

      // Create a data URL from the base64 audio
      const url = `data:audio/${result.format};base64,${result.audioBase64}`;
      // Estimate duration from text length and speed (rough approximation)
      const estimatedDuration = Math.max(1, Math.round(text.length / (15 * (speed ?? 1))));

      return {
        success: true,
        output: {
          url,
          duration: estimatedDuration,
          format: result.format,
          provider: result.provider,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Voice generation failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    if (!(config as Record<string, unknown>).text) return "text is required";
    return null;
  },
};

// ─── Update CRM Action ─────────────────────────────────────────

const updateCrmHandler: ActionHandler = {
  type: "update_crm",

  execute: async (config, _context) => {
    void _context;
    const { entity, id, updates } = config as {
      entity: "lead" | "contact" | "company";
      id: string;
      updates: Record<string, unknown>;
    };

    if (!entity || !id || !updates) {
      return { success: false, error: "entity, id, and updates are required" };
    }

    const entityTableMap: Record<string, string> = {
      lead: "leads",
      contact: "contacts",
      company: "companies",
    };

    const table = entityTableMap[entity];
    if (!table) {
      return { success: false, error: `Invalid CRM entity: ${entity}` };
    }

    try {
      const { createServerSupabaseClient } = await import("@/lib/supabase/server-client");
      const supabase = await createServerSupabaseClient();

      const { data, error } = await supabase
        .from(table)
        .update(updates)
        .eq("id", id)
        .select("*");

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, output: { updated: true, entity, id, data } };
    } catch (error) {
      return {
        success: false,
        error: `CRM update failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.entity) return "entity is required (lead, contact, or company)";
    if (!c.id) return "id is required";
    if (!c.updates) return "updates is required";
    return null;
  },
};

// ─── Create Invoice Action ─────────────────────────────────────

const createInvoiceHandler: ActionHandler = {
  type: "create_invoice",

  execute: async (config, context) => {
    const { customer_id, items, due_date, notes } = config as {
      customer_id: string;
      items: Array<{ description: string; quantity: number; unit_price: number }>;
      due_date?: string;
      notes?: string;
    };

    if (!customer_id || !items || items.length === 0) {
      return { success: false, error: "customer_id and items are required" };
    }

    try {
      const { createServerSupabaseClient } = await import("@/lib/supabase/server-client");
      const supabase = await createServerSupabaseClient();

      // Calculate totals
      const subtotal = items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0,
      );
      const taxRate = 0;
      const discountAmount = 0;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount - discountAmount;

      // Generate invoice number
      const d = new Date();
      const prefix = `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-`;
      const { data: lastInvoice } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("workspace_id", context.workspaceId)
        .ilike("invoice_number", `${prefix}%`)
        .order("invoice_number", { ascending: false })
        .limit(1)
        .single();

      let seq = 1;
      if (lastInvoice) {
        const parts = lastInvoice.invoice_number.split("-");
        seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
      }
      const invoiceNumber = `${prefix}${String(seq).padStart(4, "0")}`;

      const now = new Date().toISOString();

      // Insert invoice
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .insert({
          workspace_id: context.workspaceId,
          customer_id,
          invoice_number: invoiceNumber,
          status: "draft" as const,
          issue_date: now,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          discount_amount: discountAmount,
          total,
          amount_paid: 0,
          currency: "USD",
          notes: notes ?? "",
          terms: "",
          payment_reference: "",
          tags: [],
          created_by: context.userId,
          due_date: due_date ?? null,
          company_id: null,
        })
        .select()
        .single();

      if (invError || !invoice) {
        return { success: false, error: invError?.message ?? "Failed to create invoice" };
      }

      // Insert line items
      const itemRows = items.map((item, idx) => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: null,
        discount_percent: null,
        total: item.quantity * item.unit_price,
        sort_order: idx,
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(itemRows);

      if (itemsError) {
        // Best-effort cleanup
        await supabase.from("invoices").delete().eq("id", invoice.id);
        return { success: false, error: itemsError.message };
      }

      return {
        success: true,
        output: { invoiceId: invoice.id, invoiceNumber, total },
      };
    } catch (error) {
      return {
        success: false,
        error: `Invoice creation failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: true,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.customer_id) return "customer_id is required";
    if (!c.items || !Array.isArray(c.items) || (c.items as unknown[]).length === 0) {
      return "items is required and must be a non-empty array";
    }
    return null;
  },
};

// ─── Custom Action ─────────────────────────────────────────────

const customActionHandler: ActionHandler = {
  type: "custom",

  execute: async (config, context) => {
    const { handlerPath, handlerFunction, params } = config as {
      handlerPath: string;
      handlerFunction: string;
      params?: Record<string, unknown>;
    };

    if (!handlerPath || !handlerFunction) {
      return { success: false, error: "handlerPath and handlerFunction are required" };
    }

    try {
      // Dynamically import the handler module
      const mod = await import(/* webpackIgnore: true */ handlerPath);
      const handler = mod[handlerFunction];

      if (typeof handler !== "function") {
        return { success: false, error: `Function ${handlerFunction} not found in ${handlerPath}` };
      }

      const result = await handler({ ...params, ...context });
      return { success: true, output: result };
    } catch (error) {
      return {
        success: false,
        error: `Custom action failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldRetry: false,
      };
    }
  },

  validate: (config) => {
    const c = config as Record<string, unknown>;
    if (!c.handlerPath) return "handlerPath is required";
    if (!c.handlerFunction) return "handlerFunction is required";
    return null;
  },
};

/**
 * All built-in action handlers.
 */
export const builtinActionHandlers: ActionHandler[] = [
  sendNotificationHandler,
  createTaskHandler,
  delayHandler,
  httpRequestHandler,
  webhookHandler,
  conditionHandler,
  loopHandler,
  aiChatHandler,
  aiGenerateHandler,
  updateDatabaseHandler,
  updateRecordHandler,
  createRecordHandler,
  transformDataHandler,
  generateImageHandler,
  generateVideoHandler,
  generateVoiceHandler,
  updateCrmHandler,
  createInvoiceHandler,
  customActionHandler,
];

/**
 * Register all built-in action handlers.
 */
export function registerBuiltinActions(): void {
  for (const handler of builtinActionHandlers) {
    actionRegistry.register({ type: handler.type, handler });
  }
  logger.info("Built-in actions registered", { count: builtinActionHandlers.length });
}
