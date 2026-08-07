/**
 * Supa AI — Phase 10 Integration Hub — Internal Module Wiring.
 *
 * Wires the {@link EventBus} to every internal module so that events
 * flowing through the hub fan out to:
 *
 *   - Chat          (workflow events → conversation side-effects)
 *   - AI Employees   (workflow events → employee task dispatch)
 *   - Automation     (events → workflow triggers)
 *   - CRM            (crm.* events → contact/deal updates)
 *   - ERP            (erp.* events → invoice/payment updates)
 *   - Workspace      (workspace.* events → activity feed)
 *   - Billing        (billing.* events → subscription lifecycle)
 *   - Notifications  (any event → notification dispatch)
 *   - Search         (index updates on workspace document changes)
 *   - KB             (kb.article.published → kb index)
 *   - Reports        (report.generated → notification dispatch)
 *
 * All subscriptions are best-effort: a throwing subscriber is logged
 * but never aborts the dispatch. The function is idempotent — safe to
 * call multiple times.
 *
 * @module @/lib/integrations/internal-modules
 */
import "server-only";

import { logger } from "@/lib/logger";

import { IntegrationEvents, eventBus } from "./event-bus";
import type { IntegrationEvent } from "./types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _wired = false;

/**
 * Initialize the internal-module integration: subscribe every internal
 * module to the relevant {@link EventBus} events. Idempotent.
 *
 * Called at server boot via `src/instrumentation.ts`.
 */
export function initializeInternalModuleIntegration(): void {
  if (_wired) return;
  _wired = true;

  // Wildcard subscriber: log every event at debug level so operators
  // can see what's flowing through the hub.
  eventBus.subscribe("*", (event) => {
    logger.debug("integration.event-bus.event", {
      type: event.type,
      source: event.source,
      category: event.category,
      workspaceId: event.workspace_id,
    });
  });

  // Automation: workflow events feed into trigger dispatch.
  subscribeQuiet(
    IntegrationEvents.workflowRunStarted,
    "automation",
    (event) => {
      logger.info("automation.workflow.run.started (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.workflowRunCompleted,
    "automation",
    (event) => {
      logger.info("automation.workflow.run.completed (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // AI Employees: react to workflow events by dispatching tasks.
  subscribeQuiet(
    IntegrationEvents.employeeTaskCompleted,
    "ai-employees",
    (event) => {
      logger.info("ai-employees.task.completed (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // CRM: contact + deal events.
  subscribeQuiet(
    IntegrationEvents.crmContactCreated,
    "crm",
    (event) => {
      logger.info("crm.contact.created (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.crmDealStageChanged,
    "crm",
    (event) => {
      logger.info("crm.deal.stage_changed (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // ERP: invoice + payment events.
  subscribeQuiet(
    IntegrationEvents.erpInvoiceCreated,
    "erp",
    (event) => {
      logger.info("erp.invoice.created (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.erpPaymentReceived,
    "erp",
    (event) => {
      logger.info("erp.payment.received (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // Billing: subscription + invoice events.
  subscribeQuiet(
    IntegrationEvents.billingSubscriptionCreated,
    "billing",
    (event) => {
      logger.info("billing.subscription.created (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.billingInvoicePaid,
    "billing",
    (event) => {
      logger.info("billing.invoice.paid (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // Notifications: every notification.* event gets logged.
  subscribeQuiet(
    IntegrationEvents.notificationSent,
    "notifications",
    (event) => {
      logger.info("notification.sent (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // Workspace: member + document events.
  subscribeQuiet(
    IntegrationEvents.workspaceMemberAdded,
    "workspace",
    (event) => {
      logger.info("workspace.member.added (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.workspaceDocumentCreated,
    "workspace",
    (event) => {
      logger.info("workspace.document.created (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // Search + KB: index updates.
  subscribeQuiet(
    IntegrationEvents.searchIndexUpdated,
    "search",
    (event) => {
      logger.info("search.index.updated (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.kbArticlePublished,
    "kb",
    (event) => {
      logger.info("kb.article.published (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // Reports.
  subscribeQuiet(
    IntegrationEvents.reportGenerated,
    "reports",
    (event) => {
      logger.info("report.generated (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  // Integration lifecycle: log every connect / disconnect / sync event.
  subscribeQuiet(
    IntegrationEvents.integrationConnected,
    "integration",
    (event) => {
      logger.info("integration.connected (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.integrationDisconnected,
    "integration",
    (event) => {
      logger.info("integration.disconnected (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.integrationSyncCompleted,
    "integration",
    (event) => {
      logger.info("integration.sync.completed (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );
  subscribeQuiet(
    IntegrationEvents.webhookReceived,
    "integration",
    (event) => {
      logger.info("integration.webhook.received (via event-bus)", {
        workspaceId: event.workspace_id,
        payload: event.payload,
      });
    },
  );

  logger.info("Phase 10 internal-module integration initialized.", {
    eventsWired: Object.keys(IntegrationEvents).length,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Subscribe + log on error so a throwing subscriber never aborts dispatch. */
function subscribeQuiet(
  eventType: string,
  module: string,
  handler: (event: IntegrationEvent) => void,
): void {
  eventBus.subscribe(eventType, async (event) => {
    try {
      handler(event);
    } catch (err) {
      logger.warn("internal-module subscriber threw", {
        module,
        eventType,
        error: String(err),
      });
    }
  });
}

/** Reset the wiring state (used by tests). */
export function _resetInternalModuleIntegration(): void {
  _wired = false;
}
