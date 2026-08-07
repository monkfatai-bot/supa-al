/**
 * Supa AI — Phase 10 Business AI Assistant (server-only).
 *
 * Answers natural-language business questions grounded in the
 * workspace's business data (customers, leads, opportunities, invoices,
 * expenses). Mirrors the Phase 9 workspace AI assistant pattern:
 *
 *   1. Pull a small set of contextual aggregates (counts, month revenue /
 *      expenses, top opportunities) so the model has real numbers to
 *      reason about.
 *   2. Build a system prompt that explains the assistant's role +
 *      exposes the snapshot.
 *   3. Call `ai.chat()` (the same provider-agnostic facade used by the
 *      Phase 3 chat engine).
 *   4. Return the answer + the snapshot so the UI can render the
 *      grounding context alongside the response.
 *
 * Throws {@link ConfigurationError} when no AI provider is configured
 * (mirrors {@link EmployeeService.chat} and {@link AiAssistant.ask}).
 *
 * @module @/lib/business/ai-assistant-service
 */
import "server-only";

import { ai, type ChatMessage } from "@/lib/ai";
import { ConfigurationError } from "@/lib/errors";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type { BusinessAiAnswer } from "./types";
import {
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

class BusinessAIAssistant {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Answer `question` grounded in the workspace's business snapshot.
   */
  async ask(
    workspaceId: string,
    userId: string,
    question: string,
  ): Promise<BusinessAiAnswer> {
    const q = question?.trim();
    if (!q) {
      throw new ValidationError("Question is required.");
    }
    await assertMember(this.supabase, workspaceId, userId);

    try {
      const snapshot = await this.gatherContext(workspaceId);

      const systemPrompt = [
        "You are the Supa AI Business Assistant — a knowledgeable analyst",
        "for a workspace's CRM + invoicing + expense + inventory data.",
        "Use the snapshot below to answer the user's question precisely.",
        "When the snapshot does not contain enough data, say so honestly",
        "and suggest the action that would produce the answer (e.g.",
        "'record an invoice' or 'create an opportunity').",
        "",
        "Workspace business snapshot:",
        `- Customers: ${snapshot.customerCount} total, ${snapshot.activeCustomerCount} active.`,
        `- Leads: ${snapshot.leadCount} total, ${snapshot.openLeadCount} open.`,
        `- Opportunities: ${snapshot.opportunityCount} total, ${snapshot.openOpportunityCount} open.`,
        `- Weighted pipeline value: ${snapshot.weightedPipeline.toFixed(2)}.`,
        `- Invoices: ${snapshot.invoiceCount} total, ${snapshot.paidInvoiceCount} paid, ${snapshot.overdueInvoiceCount} overdue.`,
        `- Outstanding invoice amount: ${snapshot.outstandingAmount.toFixed(2)}.`,
        `- Revenue this month: ${snapshot.monthRevenue.toFixed(2)}.`,
        `- Expenses this month: ${snapshot.monthExpenses.toFixed(2)}.`,
        `- Net this month: ${snapshot.netMonth.toFixed(2)}.`,
      ].join("\n");

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: q },
      ];

      const response = await ai.chat(
        { messages },
        { feature: "business-assistant", userId },
      );

      return {
        answer: response.message.content,
        context: {
          customerCount: snapshot.customerCount,
          leadCount: snapshot.leadCount,
          opportunityCount: snapshot.opportunityCount,
          invoiceCount: snapshot.invoiceCount,
          monthRevenue: snapshot.monthRevenue,
          monthExpenses: snapshot.monthExpenses,
        },
        provider: response.provider,
        model: response.model,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      if (
        err instanceof NotFoundError ||
        err instanceof ValidationError ||
        err instanceof ConfigurationError
      ) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure in business AI assistant.", {
        workspaceId,
      });
    }
  }

  /**
   * Pull the small snapshot that grounds the assistant's answer. Kept
   * narrow on purpose — large snapshots would push the AI call over the
   * model's context window without improving the answer.
   */
  private async gatherContext(workspaceId: string): Promise<{
    customerCount: number;
    activeCustomerCount: number;
    leadCount: number;
    openLeadCount: number;
    opportunityCount: number;
    openOpportunityCount: number;
    weightedPipeline: number;
    invoiceCount: number;
    paidInvoiceCount: number;
    overdueInvoiceCount: number;
    outstandingAmount: number;
    monthRevenue: number;
    monthExpenses: number;
    netMonth: number;
  }> {
    const now = new Date();
    const monthStartIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    )
      .toISOString()
      .slice(0, 10);

    const customers = await this.supabase
      .from("customers")
      .select("id, status", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    if (customers.error) {
      throw toDbError(customers.error, "ai-assistant.gatherContext customers failed");
    }
    const activeCustomers = await this.supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    if (activeCustomers.error) {
      throw toDbError(activeCustomers.error, "ai-assistant.gatherContext active customers failed");
    }

    const leads = await this.supabase
      .from("leads")
      .select("id, status", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    if (leads.error) {
      throw toDbError(leads.error, "ai-assistant.gatherContext leads failed");
    }
    const openLeads = await this.supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["new", "contacted", "qualified", "proposal", "negotiation"]);
    if (openLeads.error) {
      throw toDbError(openLeads.error, "ai-assistant.gatherContext open leads failed");
    }

    const opps = await this.supabase
      .from("opportunities")
      .select("id, stage, amount, probability")
      .eq("workspace_id", workspaceId);
    if (opps.error) {
      throw toDbError(opps.error, "ai-assistant.gatherContext opportunities failed");
    }
    const oppRows = (opps.data ?? []) as Array<{
      stage: string;
      amount: number;
      probability: number;
    }>;
    const openOpps = oppRows.filter((o) =>
      ["prospecting", "qualification", "needs-analysis", "proposal", "negotiation"].includes(o.stage),
    );
    const weightedPipeline = openOpps.reduce(
      (sum, o) => sum + Number(o.amount ?? 0) * (Number(o.probability ?? 0) / 100),
      0,
    );

    const invoices = await this.supabase
      .from("invoices")
      .select("id, status, total, issue_date")
      .eq("workspace_id", workspaceId);
    if (invoices.error) {
      throw toDbError(invoices.error, "ai-assistant.gatherContext invoices failed");
    }
    const invRows = (invoices.data ?? []) as Array<{
      status: string;
      total: number;
      issue_date: string;
    }>;
    const paidInvoices = invRows.filter((i) => i.status === "paid");
    const overdueInvoices = invRows.filter((i) => i.status === "overdue");
    const outstanding = invRows
      .filter((i) => ["sent", "viewed", "partial", "overdue"].includes(i.status))
      .reduce((sum, i) => sum + Number(i.total ?? 0), 0);
    const monthRevenue = paidInvoices
      .filter((i) => i.issue_date >= monthStartIso)
      .reduce((sum, i) => sum + Number(i.total ?? 0), 0);

    const expenses = await this.supabase
      .from("expenses")
      .select("id, status, amount, date")
      .eq("workspace_id", workspaceId);
    if (expenses.error) {
      throw toDbError(expenses.error, "ai-assistant.gatherContext expenses failed");
    }
    const expRows = (expenses.data ?? []) as Array<{
      status: string;
      amount: number;
      date: string;
    }>;
    const paidExpenses = expRows.filter((e) => e.status === "paid");
    const monthExpenses = paidExpenses
      .filter((e) => e.date >= monthStartIso)
      .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

    return {
      customerCount: Number(customers.count ?? 0),
      activeCustomerCount: Number(activeCustomers.count ?? 0),
      leadCount: Number(leads.count ?? 0),
      openLeadCount: Number(openLeads.count ?? 0),
      opportunityCount: oppRows.length,
      openOpportunityCount: openOpps.length,
      weightedPipeline,
      invoiceCount: invRows.length,
      paidInvoiceCount: paidInvoices.length,
      overdueInvoiceCount: overdueInvoices.length,
      outstandingAmount: outstanding,
      monthRevenue,
      monthExpenses,
      netMonth: monthRevenue - monthExpenses,
    };
  }
}

export async function createBusinessAIAssistant(): Promise<BusinessAIAssistant> {
  const supabase = await createSupabaseServerClient();
  return new BusinessAIAssistant(supabase);
}

export { BusinessAIAssistant };
