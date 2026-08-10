"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { sendChatMessage } from "@/services/ai/service";
import { getDefaultModel } from "@/services/ai/models";
import { logger } from "@/services/logger";
import { requireMinimumRole } from "@/lib/workspace-utils";
import type {
  BusinessAssistantRequest,
  BusinessAssistantResponse,
  BusinessAssistantAction,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------



/**
 * Call the AI service and return the raw text content.
 * Wraps error handling so every caller stays consistent.
 */
async function callAi(systemPrompt: string, userPrompt: string): Promise<string> {
  const defaultModel = getDefaultModel();
  const model = defaultModel?.id ?? "gpt-4o-mini";
  try {
    const response = await sendChatMessage({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 4096,
    });
    return response.content;
  } catch (error) {
    logger.error("Business assistant AI call failed", { error });
    throw error;
  }
}

/**
 * Call the AI with JSON mode expectations and safely parse the response.
 * Falls back to extracting JSON from markdown code fences if needed.
 */
async function callAiForJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const raw = await callAi(systemPrompt, userPrompt);
  // Try direct parse first
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Attempt to extract from markdown fences
    const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch?.[1]) {
      return JSON.parse(fenceMatch[1].trim()) as T;
    }
    throw new Error("AI response is not valid JSON");
  }
}

function fail(
  action: BusinessAssistantAction,
  message: string,
): BusinessAssistantResponse {
  return { success: false, content: "", action, error: message };
}

function ok(
  action: BusinessAssistantAction,
  content: string,
  metadata?: Record<string, unknown>,
): BusinessAssistantResponse {
  return { success: true, content, action, metadata };
}

// ---------------------------------------------------------------------------
// Main Dispatcher
// ---------------------------------------------------------------------------

/**
 * Main dispatcher — routes the request to the correct handler based on
 * `data.action`.
 */
export async function handleBusinessAssistant(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  try {
    switch (data.action) {
      case "generate_invoice":
        return await handleGenerateInvoice(data);
      case "generate_proposal":
        return await handleGenerateProposal(data);
      case "analyze_sales":
        return await handleAnalyzeSales(data);
      case "forecast_revenue":
        return await handleForecastRevenue(data);
      case "recommend_pricing":
        return await handleRecommendPricing(data);
      case "write_contract":
        return await handleWriteContract(data);
      case "create_quotation":
        return await handleCreateQuotation(data);
      case "generate_report":
        return await handleGenerateReport(data);
      case "analyze_expenses":
        return await handleAnalyzeExpenses(data);
      case "executive_summary":
        return await handleExecutiveSummary(data);
      default:
        return fail(data.action, `Unknown action: ${data.action}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Business assistant error", { action: data.action, error: message });
    return fail(data.action, message);
  }
}

// ---------------------------------------------------------------------------
// 1. Generate Invoice
// ---------------------------------------------------------------------------

interface GenerateInvoiceParams {
  customerName: string;
  items: string[];
  currency?: string;
}

export async function generateInvoiceWithAi(
  workspaceId: string,
  params: GenerateInvoiceParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();

  if (!params.customerName || !params.items?.length) {
    return fail("generate_invoice", "customerName and items are required.");
  }

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("generate_invoice", "Workspace not found or access denied.");
  }

  const currency = params.currency ?? "USD";

  const systemPrompt = `You are a professional invoice generation assistant. Given a customer name and a list of line-item descriptions, generate a complete, structured invoice as JSON.

Return a JSON object with this exact structure:
{
  "invoiceNumber": "INV-YYYYMMDD-XXXX",
  "customerName": "...",
  "currency": "...",
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "notes": "Payment is due within 30 days.",
  "items": [
    {
      "description": "...",
      "quantity": 1,
      "unitPrice": 0.00,
      "taxRate": 0,
      "discountPercent": 0,
      "total": 0.00
    }
  ],
  "subtotal": 0.00,
  "taxAmount": 0.00,
  "discountAmount": 0.00,
  "total": 0.00
}

Be realistic with pricing. Set reasonable unit prices based on common market rates for the described services or goods. Today's date is ${new Date().toISOString().split("T")[0]}. Return ONLY the JSON, no commentary.`;

  const userPrompt = `Customer: ${params.customerName}
Currency: ${currency}
Items/services requested:
${params.items.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Generate a professional invoice for these items.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("generate_invoice", JSON.stringify(result, null, 2), {
      generatedInvoice: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("generate_invoice", `Failed to generate invoice: ${message}`);
  }
}

async function handleGenerateInvoice(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await generateInvoiceWithAi(data.workspaceId, {
    customerName: String(ctx.customerName ?? ""),
    items: Array.isArray(ctx.items) ? ctx.items.map(String) : [],
    currency: ctx.currency ? String(ctx.currency) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 2. Generate Proposal
// ---------------------------------------------------------------------------

interface GenerateProposalParams {
  type?: string;
  customerName: string;
  description: string;
  tone?: string;
}

export async function generateProposalWithAi(
  workspaceId: string,
  params: GenerateProposalParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();

  if (!params.customerName || !params.description) {
    return fail("generate_proposal", "customerName and description are required.");
  }

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("generate_proposal", "Workspace not found or access denied.");
  }

  const tone = params.tone ?? "professional";
  const proposalType = params.type ?? "business";

  const systemPrompt = `You are an expert proposal writer. Generate a professional business proposal.

Return a JSON object:
{
  "title": "...",
  "summary": "Brief executive summary (2-3 sentences)",
  "sections": [
    {
      "heading": "...",
      "content": "..."
    }
  ],
  "estimatedValue": 0,
  "timeline": "...",
  "conclusion": "..."
}

The tone should be ${tone}. The proposal type is "${proposalType}". Include at least 4 sections: Introduction/Problem Statement, Proposed Solution, Approach & Methodology, Pricing/Timeline, and Conclusion. Be specific and actionable. Return ONLY valid JSON.`;

  const userPrompt = `Customer: ${params.customerName}
Proposal type: ${proposalType}
Description of need: ${params.description}

Generate a comprehensive proposal.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("generate_proposal", JSON.stringify(result, null, 2), {
      generatedProposal: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("generate_proposal", `Failed to generate proposal: ${message}`);
  }
}

async function handleGenerateProposal(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await generateProposalWithAi(data.workspaceId, {
    type: ctx.type ? String(ctx.type) : undefined,
    customerName: String(ctx.customerName ?? ""),
    description: String(ctx.description ?? ""),
    tone: ctx.tone ? String(ctx.tone) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 3. Analyze Sales
// ---------------------------------------------------------------------------

interface AnalyzeSalesParams {
  periodStart?: string;
  periodEnd?: string;
}

export async function analyzeSales(
  workspaceId: string,
  params?: AnalyzeSalesParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("analyze_sales", "Workspace not found or access denied.");
  }

  // Query invoices
  let invoiceQuery = supabase
    .from("invoices")
    .select("*, customers!inner(name)")
    .eq("workspace_id", workspaceId);

  if (params?.periodStart) {
    invoiceQuery = invoiceQuery.gte("issue_date", params.periodStart);
  }
  if (params?.periodEnd) {
    invoiceQuery = invoiceQuery.lte("issue_date", params.periodEnd);
  }

  const { data: invoices, error: invError } = await invoiceQuery
    .order("issue_date", { ascending: false })
    .limit(200);

  if (invError) {
    logger.error("Failed to fetch invoices for sales analysis", { reason: invError.message });
    return fail("analyze_sales", "Failed to fetch invoice data.");
  }

  // Query open opportunities
  const { data: opportunities, error: oppError } = await supabase
    .from("opportunities")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("stage", ["lead", "qualification", "proposal", "negotiation"])
    .order("value", { ascending: false })
    .limit(100);

  if (oppError) {
    logger.error("Failed to fetch opportunities for sales analysis", { reason: oppError.message });
  }

  // Build summary for AI
  const invoiceData = (invoices ?? []).map((inv: Record<string, unknown>) => {
    const customer = inv.customers as unknown as { name: string } | null;
    return {
      number: inv.invoice_number,
      customer: customer?.name ?? "Unknown",
      status: inv.status,
      total: inv.total,
      currency: inv.currency,
      date: inv.issue_date,
      paid: inv.amount_paid,
    };
  });

  const opportunityData = (opportunities ?? []).map((opp: Record<string, unknown>) => ({
    title: opp.title,
    stage: opp.stage,
    value: opp.value,
    probability: opp.probability,
  }));

  const totalRevenue = invoiceData.reduce((sum, i) => sum + (i.total as number), 0);
  const totalPaid = invoiceData.reduce((sum, i) => sum + (i.paid as number), 0);
  const pipelineValue = opportunityData.reduce((sum, o) => sum + (o.value as number), 0);

  const systemPrompt = `You are a senior sales analyst. Analyze the provided sales data and produce actionable insights.

Return a JSON object:
{
  "summary": "Overall sales performance summary (3-5 sentences)",
  "keyInsights": [
    "Insight 1...",
    "Insight 2...",
    "Insight 3..."
  ],
  "topPerformers": [
    { "customer": "...", "revenue": 0, "invoiceCount": 0 }
  ],
  "trends": "Observed trends in the data",
  "recommendations": [
    "Recommendation 1...",
    "Recommendation 2..."
  ],
  "metrics": {
    "totalRevenue": 0,
    "totalPaid": 0,
    "outstandingAmount": 0,
    "pipelineValue": 0,
    "invoiceCount": 0,
    "averageInvoiceValue": 0
  }
}

Be specific, data-driven, and actionable. Return ONLY valid JSON.`;

  const userPrompt = `Sales data for analysis:
- Total invoices: ${invoiceData.length}
- Total revenue: $${totalRevenue.toFixed(2)}
- Total collected: $${totalPaid.toFixed(2)}
- Pipeline value: $${pipelineValue.toFixed(2)}

Invoices:
${JSON.stringify(invoiceData.slice(0, 50), null, 2)}

Open opportunities:
${JSON.stringify(opportunityData.slice(0, 30), null, 2)}

Analyze this sales data and provide insights.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("analyze_sales", JSON.stringify(result, null, 2), {
      salesAnalysis: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("analyze_sales", `Failed to analyze sales: ${message}`);
  }
}

async function handleAnalyzeSales(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await analyzeSales(data.workspaceId, {
    periodStart: ctx.periodStart ? String(ctx.periodStart) : undefined,
    periodEnd: ctx.periodEnd ? String(ctx.periodEnd) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 4. Forecast Revenue
// ---------------------------------------------------------------------------

interface ForecastRevenueParams {
  months?: number;
}

export async function forecastRevenue(
  workspaceId: string,
  params?: ForecastRevenueParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("forecast_revenue", "Workspace not found or access denied.");
  }

  const forecastMonths = params?.months ?? 6;

  // Get last 12 months of paid invoices
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("total, issue_date, status, currency")
    .eq("workspace_id", workspaceId)
    .gte("issue_date", twelveMonthsAgo.toISOString().split("T")[0])
    .order("issue_date", { ascending: true });

  if (error) {
    logger.error("Failed to fetch invoices for revenue forecast", { reason: error.message });
    return fail("forecast_revenue", "Failed to fetch historical invoice data.");
  }

  // Group by month
  const monthlyTotals = new Map<string, number>();
  for (const inv of invoices ?? []) {
    const month = inv.issue_date.substring(0, 7); // YYYY-MM
    monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + inv.total);
  }

  const historicalData = Array.from(monthlyTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));

  // Also get pipeline data
  const { data: openOpps } = await supabase
    .from("opportunities")
    .select("value, probability, expected_close_date")
    .eq("workspace_id", workspaceId)
    .in("stage", ["proposal", "negotiation"])
    .order("expected_close_date", { ascending: true });

  const weightedPipeline = (openOpps ?? []).reduce(
    (sum, opp) => sum + opp.value * (opp.probability / 100),
    0,
  );

  const systemPrompt = `You are a financial forecasting expert. Given historical monthly revenue data and pipeline information, generate a revenue forecast.

Return a JSON object:
{
  "methodology": "Brief description of forecasting approach",
  "trend": "overall_trend" | "growing" | "declining" | "stable",
  "confidence": "high" | "medium" | "low",
  "forecasts": [
    {
      "month": "YYYY-MM",
      "predicted": 0,
      "lower": 0,
      "upper": 0
    }
  ],
  "summary": "Brief narrative summary of the forecast",
  "keyAssumptions": ["assumption 1", "assumption 2"],
  "risks": ["risk 1", "risk 2"]
}

Generate exactly ${forecastMonths} months of forecasts starting from the month after the last historical data point. The predicted value should be realistic based on trends. Lower and upper bounds represent a confidence interval (roughly ±15-25%). Return ONLY valid JSON.`;

  const userPrompt = `Historical monthly revenue (last 12 months):
${JSON.stringify(historicalData, null, 2)}

Weighted pipeline value: $${weightedPipeline.toFixed(2)}

Generate a ${forecastMonths}-month revenue forecast.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("forecast_revenue", JSON.stringify(result, null, 2), {
      revenueForecast: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("forecast_revenue", `Failed to forecast revenue: ${message}`);
  }
}

async function handleForecastRevenue(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await forecastRevenue(data.workspaceId, {
    months: ctx.months ? Number(ctx.months) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 5. Recommend Pricing
// ---------------------------------------------------------------------------

interface RecommendPricingParams {
  productIds?: string[];
}

export async function recommendPricing(
  workspaceId: string,
  params?: RecommendPricingParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("recommend_pricing", "Workspace not found or access denied.");
  }

  // Fetch products
  let productQuery = supabase
    .from("products")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (params?.productIds?.length) {
    productQuery = productQuery.in("id", params.productIds);
  }

  const { data: products, error: prodError } = await productQuery.limit(100);

  if (prodError) {
    logger.error("Failed to fetch products for pricing", { reason: prodError.message });
    return fail("recommend_pricing", "Failed to fetch product data.");
  }

  if (!products?.length) {
    return fail("recommend_pricing", "No products found in this workspace.");
  }

  // Fetch recent invoices to understand selling prices
  const { data: invoiceItems } = await supabase
    .from("invoice_items")
    .select("description, quantity, unit_price, invoices!inner(total, issue_date, status, customer_id)")
    .eq("invoices.workspace_id", workspaceId)
    .limit(200);

  const productList = products.map((p: Record<string, unknown>) => ({
    id: p.id,
    name: p.name,
    currentPrice: p.unit_price,
    costPrice: p.cost_price,
    category: p.category,
    productType: p.product_type,
    stockQuantity: p.stock_quantity,
    description: p.description,
  }));

  const systemPrompt = `You are a pricing strategy expert. Analyze the product catalog and sales data, then recommend optimal pricing.

Return a JSON object:
{
  "summary": "Overall pricing strategy assessment (3-4 sentences)",
  "recommendations": [
    {
      "product": "Product name",
      "currentPrice": 0,
      "recommendedPrice": 0,
      "reasoning": "Why this price is recommended",
      "priceChangePercent": 0,
      "expectedImpact": "Expected revenue impact"
    }
  ],
  "overallStrategy": "Recommended overall pricing approach",
  "marketPositioning": "Suggested market positioning strategy",
  "keyFindings": [
    "Finding 1...",
    "Finding 2..."
  ]
}

Consider: current prices, cost prices (maintain healthy margins), product types, categories, and any patterns in the sales data. Be specific and justify each recommendation with data-driven reasoning. Return ONLY valid JSON.`;

  const userPrompt = `Product catalog:
${JSON.stringify(productList, null, 2)}

Recent sales data (invoice line items):
${JSON.stringify(invoiceItems ?? [], null, 2)}

Analyze these products and recommend pricing adjustments.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("recommend_pricing", JSON.stringify(result, null, 2), {
      pricingRecommendations: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("recommend_pricing", `Failed to recommend pricing: ${message}`);
  }
}

async function handleRecommendPricing(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await recommendPricing(data.workspaceId, {
    productIds: Array.isArray(ctx.productIds) ? ctx.productIds.map(String) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 6. Write Contract
// ---------------------------------------------------------------------------

interface WriteContractParams {
  contractType: string;
  description: string;
  parties?: string[];
}

export async function writeContractWithAi(
  workspaceId: string,
  params: WriteContractParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();

  if (!params.contractType || !params.description) {
    return fail("write_contract", "contractType and description are required.");
  }

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("write_contract", "Workspace not found or access denied.");
  }

  const parties = params.parties ?? ["Party A", "Party B"];

  const systemPrompt = `You are a legal contract drafting expert. Generate a professional, well-structured contract draft.

Return a JSON object:
{
  "title": "Contract title",
  "contractType": "${params.contractType}",
  "parties": ["Party 1", "Party 2"],
  "effectiveDate": "YYYY-MM-DD",
  "sections": [
    {
      "heading": "Section heading",
      "content": "Full legal text of this section..."
    }
  ],
  "terms": {
    "termination": "Termination terms",
    "confidentiality": "Confidentiality clause",
    "liability": "Liability limitations",
    "disputeResolution": "Dispute resolution mechanism"
  },
  "signatureBlocks": [
    { "party": "Party name", "title": "Authorized Signatory" }
  ],
  "summary": "Brief plain-language summary of the contract"
}

Include standard legal sections: Parties, Recitals, Scope of Work, Payment Terms, Term & Termination, Confidentiality, Liability, Governing Law, Signatures. Write complete legal text, not placeholders. Today is ${new Date().toISOString().split("T")[0]}. Return ONLY valid JSON.`;

  const userPrompt = `Contract type: ${params.contractType}
Parties: ${parties.join(", ")}
Description/Scope: ${params.description}

Draft a professional contract.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("write_contract", JSON.stringify(result, null, 2), {
      generatedContract: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("write_contract", `Failed to write contract: ${message}`);
  }
}

async function handleWriteContract(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await writeContractWithAi(data.workspaceId, {
    contractType: String(ctx.contractType ?? ""),
    description: String(ctx.description ?? ""),
    parties: Array.isArray(ctx.parties) ? ctx.parties.map(String) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 7. Create Quotation
// ---------------------------------------------------------------------------

interface CreateQuotationParams {
  customerName: string;
  requirements: string[];
}

export async function createQuotationWithAi(
  workspaceId: string,
  params: CreateQuotationParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  if (!params.customerName || !params.requirements?.length) {
    return fail("create_quotation", "customerName and requirements are required.");
  }

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("create_quotation", "Workspace not found or access denied.");
  }

  // Fetch products for reference
  const { data: products } = await supabase
    .from("products")
    .select("id, name, unit_price, category, description")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .limit(50);

  const systemPrompt = `You are a quotation generation expert. Generate a detailed, professional quotation from the customer requirements.

If matching products are found in the catalog, use their actual prices. Otherwise, estimate reasonable market prices.

Return a JSON object:
{
  "quoteNumber": "QT-YYYYMMDD-XXXX",
  "customerName": "...",
  "issueDate": "YYYY-MM-DD",
  "validUntil": "YYYY-MM-DD",
  "items": [
    {
      "description": "...",
      "quantity": 1,
      "unitPrice": 0.00,
      "taxRate": 0,
      "discountPercent": 0,
      "total": 0.00,
      "notes": "Optional notes about this item"
    }
  ],
  "subtotal": 0.00,
  "taxAmount": 0.00,
  "discountAmount": 0.00,
  "total": 0.00,
  "terms": "Quotation valid for 30 days.",
  "notes": "Additional terms or notes",
  "breakdown": "Brief explanation of pricing rationale"
}

Today is ${new Date().toISOString().split("T")[0]}. Return ONLY valid JSON.`;

  const userPrompt = `Customer: ${params.customerName}

Requirements:
${params.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Available product catalog:
${JSON.stringify(products ?? [], null, 2)}

Generate a professional quotation with realistic pricing.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("create_quotation", JSON.stringify(result, null, 2), {
      generatedQuotation: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("create_quotation", `Failed to create quotation: ${message}`);
  }
}

async function handleCreateQuotation(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await createQuotationWithAi(data.workspaceId, {
    customerName: String(ctx.customerName ?? ""),
    requirements: Array.isArray(ctx.requirements) ? ctx.requirements.map(String) : [],
  });
}

// ---------------------------------------------------------------------------
// 8. Generate Business Report
// ---------------------------------------------------------------------------

interface GenerateBusinessReportParams {
  reportType?: string;
  periodStart?: string;
  periodEnd?: string;
}

export async function generateBusinessReport(
  workspaceId: string,
  params?: GenerateBusinessReportParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("generate_report", "Workspace not found or access denied.");
  }

  const reportType = params?.reportType ?? "general";
  const periodStart = params?.periodStart;
  const periodEnd = params?.periodEnd;

  // Fetch relevant data based on period
  let invoiceQuery = supabase
    .from("invoices")
    .select("id, total, amount_paid, status, currency, issue_date, customer_id")
    .eq("workspace_id", workspaceId);

  if (periodStart) invoiceQuery = invoiceQuery.gte("issue_date", periodStart);
  if (periodEnd) invoiceQuery = invoiceQuery.lte("issue_date", periodEnd);

  const { data: invoices } = await invoiceQuery.order("issue_date", { ascending: true }).limit(200);

  let expenseQuery = supabase
    .from("expenses")
    .select("id, amount, category, vendor, expense_date, status, currency")
    .eq("workspace_id", workspaceId);

  if (periodStart) expenseQuery = expenseQuery.gte("expense_date", periodStart);
  if (periodEnd) expenseQuery = expenseQuery.lte("expense_date", periodEnd);

  const { data: expenses } = await expenseQuery.order("expense_date", { ascending: true }).limit(200);

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, total_revenue, total_invoices")
    .eq("workspace_id", workspaceId)
    .order("total_revenue", { ascending: false })
    .limit(50);

  const totalRevenue = (invoices ?? []).reduce((s, i) => s + i.total, 0);
  const totalCollected = (invoices ?? []).reduce((s, i) => s + i.amount_paid, 0);
  const totalExpenses = (expenses ?? []).reduce((s, e) => s + e.amount, 0);

  // Group expenses by category
  const expenseByCategory = new Map<string, number>();
  for (const exp of expenses ?? []) {
    expenseByCategory.set(exp.category, (expenseByCategory.get(exp.category) ?? 0) + exp.amount);
  }

  const systemPrompt = `You are a business intelligence analyst. Generate a comprehensive ${reportType} business report based on the provided data.

Return a JSON object:
{
  "title": "Report title",
  "reportType": "${reportType}",
  "generatedAt": "${new Date().toISOString()}",
  "periodStart": "${periodStart ?? "N/A"}",
  "periodEnd": "${periodEnd ?? "N/A"}",
  "executiveSummary": "3-4 sentence overview of key findings",
  "sections": [
    {
      "heading": "Section heading",
      "narrative": "Detailed analysis narrative...",
      "keyPoints": ["point 1", "point 2"]
    }
  ],
  "keyMetrics": [
    { "label": "Metric name", "value": "value", "trend": "up" | "down" | "stable" }
  ],
  "conclusions": "Overall conclusions and outlook",
  "actionItems": [
    "Recommended action 1",
    "Recommended action 2"
  ]
}

Include at least 4 sections. Write detailed, professional analysis. Be data-driven. Return ONLY valid JSON.`;

  const userPrompt = `Generate a "${reportType}" business report.

Financial Summary:
- Total Revenue: $${totalRevenue.toFixed(2)}
- Total Collected: $${totalCollected.toFixed(2)}
- Total Outstanding: $${(totalRevenue - totalCollected).toFixed(2)}
- Total Expenses: $${totalExpenses.toFixed(2)}
- Net Profit: $${(totalRevenue - totalExpenses).toFixed(2)}

Invoices (${(invoices ?? []).length}):
${JSON.stringify((invoices ?? []).slice(0, 30), null, 2)}

Expenses by Category:
${JSON.stringify(Object.fromEntries(expenseByCategory), null, 2)}

Top Customers (${(customers ?? []).length}):
${JSON.stringify((customers ?? []).slice(0, 20), null, 2)}

Write a comprehensive business report.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("generate_report", JSON.stringify(result, null, 2), {
      businessReport: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("generate_report", `Failed to generate report: ${message}`);
  }
}

async function handleGenerateReport(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await generateBusinessReport(data.workspaceId, {
    reportType: ctx.reportType ? String(ctx.reportType) : undefined,
    periodStart: ctx.periodStart ? String(ctx.periodStart) : undefined,
    periodEnd: ctx.periodEnd ? String(ctx.periodEnd) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 9. Analyze Expenses
// ---------------------------------------------------------------------------

interface AnalyzeExpensesParams {
  periodStart?: string;
  periodEnd?: string;
}

export async function analyzeExpenses(
  workspaceId: string,
  params?: AnalyzeExpensesParams,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("analyze_expenses", "Workspace not found or access denied.");
  }

  let query = supabase
    .from("expenses")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (params?.periodStart) {
    query = query.gte("expense_date", params.periodStart);
  }
  if (params?.periodEnd) {
    query = query.lte("expense_date", params.periodEnd);
  }

  const { data: expenses, error } = await query
    .order("expense_date", { ascending: true })
    .limit(300);

  if (error) {
    logger.error("Failed to fetch expenses for analysis", { reason: error.message });
    return fail("analyze_expenses", "Failed to fetch expense data.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenseList = (expenses ?? []).map((e: any) => ({
    id: e.id,
    category: String(e.category ?? ""),
    amount: Number(e.amount ?? 0),
    currency: String(e.currency ?? "USD"),
    vendor: String(e.vendor ?? ""),
    description: String(e.description ?? ""),
    date: String(e.expense_date ?? ""),
    status: String(e.status ?? ""),
  }));

  const totalExpenses = expenseList.reduce((s, e) => s + e.amount, 0);

  // Group by category
  const byCategory = new Map<string, number>();
  for (const e of expenseList) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }

  // Group by vendor
  const byVendor = new Map<string, number>();
  for (const e of expenseList) {
    byVendor.set(e.vendor, (byVendor.get(e.vendor) ?? 0) + e.amount);
  }

  // Group by month
  const byMonth = new Map<string, number>();
  for (const e of expenseList) {
    const month = e.date.substring(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + e.amount);
  }

  const systemPrompt = `You are a financial analyst specializing in expense management. Analyze the expense data and provide actionable insights.

Return a JSON object:
{
  "summary": "Overall expense analysis summary (3-5 sentences)",
  "totalExpenses": 0,
  "categoryBreakdown": [
    { "category": "...", "amount": 0, "percent": 0 }
  ],
  "vendorAnalysis": [
    { "vendor": "...", "totalSpent": 0, "transactionCount": 0 }
  ],
  "monthlyTrend": [
    { "month": "YYYY-MM", "amount": 0 }
  ],
  "topExpenses": [
    { "description": "...", "amount": 0, "vendor": "...", "category": "..." }
  ],
  "anomalies": [
    "Anomaly 1...",
    "Anomaly 2..."
  ],
  "savingsOpportunities": [
    { "area": "...", "potentialSaving": 0, "recommendation": "..." }
  ],
  "recommendations": [
    "Recommendation 1...",
    "Recommendation 2..."
  ]
}

Be specific, data-driven, and identify cost-saving opportunities. Return ONLY valid JSON.`;

  const userPrompt = `Expense data for analysis (${expenseList.length} records):

Category breakdown:
${JSON.stringify(Object.fromEntries(byCategory), null, 2)}

Vendor breakdown:
${JSON.stringify(Object.fromEntries(Array.from(byVendor.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)), null, 2)}

Monthly trend:
${JSON.stringify(Object.fromEntries(byMonth), null, 2)}

All expenses:
${JSON.stringify(expenseList.slice(0, 50), null, 2)}

Total expenses: $${totalExpenses.toFixed(2)}

Analyze these expenses thoroughly and provide actionable insights.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("analyze_expenses", JSON.stringify(result, null, 2), {
      expenseAnalysis: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("analyze_expenses", `Failed to analyze expenses: ${message}`);
  }
}

async function handleAnalyzeExpenses(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  const ctx = data.context ?? {};
  return await analyzeExpenses(data.workspaceId, {
    periodStart: ctx.periodStart ? String(ctx.periodStart) : undefined,
    periodEnd: ctx.periodEnd ? String(ctx.periodEnd) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 10. Executive Summary
// ---------------------------------------------------------------------------

export async function generateExecutiveSummary(
  workspaceId: string,
): Promise<BusinessAssistantResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    return fail("executive_summary", "Workspace not found or access denied.");
  }

  // --- Invoices (last 30 days) ---
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: recentInvoices } = await supabase
    .from("invoices")
    .select("id, total, amount_paid, status, issue_date")
    .eq("workspace_id", workspaceId)
    .gte("issue_date", cutoff)
    .order("issue_date", { ascending: false })
    .limit(100);

  // --- Expenses (last 30 days) ---
  const { data: recentExpenses } = await supabase
    .from("expenses")
    .select("id, amount, category, expense_date, status")
    .eq("workspace_id", workspaceId)
    .gte("expense_date", cutoff)
    .order("expense_date", { ascending: false })
    .limit(100);

  // --- Projects ---
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, progress_percent, priority, start_date, end_date, budget")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  // --- Tasks ---
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, project_id")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);

  // --- Leads ---
  const { data: leads } = await supabase
    .from("leads")
    .select("id, title, status, score, value, source, expected_close_date")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  // --- Opportunities ---
  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, title, stage, value, probability, expected_close_date")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  // --- Customers ---
  const { count: customerCount } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // --- Workspace info ---
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name, member_count")
    .eq("id", workspaceId)
    .single();

  // Aggregate metrics
  const recentRevenue = (recentInvoices ?? []).reduce((s, i) => s + i.total, 0);
  const recentCollected = (recentInvoices ?? []).reduce((s, i) => s + i.amount_paid, 0);
  const recentExpenseTotal = (recentExpenses ?? []).reduce((s, e) => s + e.amount, 0);
  const activeProjectsCount = (projects ?? []).filter((p) => p.status === "active").length;
  void activeProjectsCount; // used in prompt context below
  const overdueTasks = (tasks ?? []).filter(
    (t) => t.status !== "done" && t.status !== "cancelled" && t.due_date && t.due_date < cutoff,
  ).length;
  const openLeadsCount = (leads ?? []).filter((l) => l.status === "new" || l.status === "contacted").length;
  void openLeadsCount; // used in prompt context below
  const pipelineValue = (opportunities ?? []).reduce((s, o) => s + o.value, 0);

  const tasksByStatus = new Map<string, number>();
  for (const t of tasks ?? []) {
    tasksByStatus.set(t.status, (tasksByStatus.get(t.status) ?? 0) + 1);
  }

  const projectsByStatus = new Map<string, number>();
  for (const p of projects ?? []) {
    projectsByStatus.set(p.status, (projectsByStatus.get(p.status) ?? 0) + 1);
  }

  const systemPrompt = `You are a C-level executive advisor. Generate a comprehensive executive summary of the business based on the provided aggregated data.

Return a JSON object:
{
  "overview": "A concise 4-6 sentence executive overview of the business state",
  "keyMetrics": [
    { "label": "Metric Name", "value": "formatted value", "trend": "positive|negative|neutral", "context": "Brief context" }
  ],
  "financialHealth": {
    "assessment": "Overall financial health assessment",
    "revenueTrend": "Description of revenue trend",
    "expenseAnalysis": "Brief expense analysis"
  },
  "operationalStatus": {
    "assessment": "Operational health assessment",
    "projectStatus": "Project portfolio status",
    "taskHealth": "Task pipeline health"
  },
  "salesPipeline": {
    "assessment": "Pipeline health assessment",
    "leadConversion": "Lead status assessment"
  },
  "risks": [
    { "risk": "Risk description", "severity": "high|medium|low", "mitigation": "Suggested mitigation" }
  ],
  "opportunities": [
    { "opportunity": "Description", "potentialImpact": "High|Medium|Low", "actionRequired": "..." }
  ],
  "recommendations": [
    { "recommendation": "Description", "priority": "high|medium|low", "owner": "Suggested owner", "timeline": "Suggested timeline" }
  ],
  "nextSteps": [
    "Action item 1",
    "Action item 2"
  ]
}

Write in a clear, executive-appropriate tone. Focus on actionable insights. Be specific with numbers. Return ONLY valid JSON.`;

  const userPrompt = `Generate an executive summary for workspace: ${workspace?.name ?? "Unknown"}.

Key Metrics (last 30 days):
- Total Revenue: $${recentRevenue.toFixed(2)}
- Collected Revenue: $${recentCollected.toFixed(2)}
- Outstanding: $${(recentRevenue - recentCollected).toFixed(2)}
- Total Expenses: $${recentExpenseTotal.toFixed(2)}
- Net Income: $${(recentRevenue - recentExpenseTotal).toFixed(2)}

Recent Invoices (${(recentInvoices ?? []).length}):
${JSON.stringify((recentInvoices ?? []).slice(0, 20), null, 2)}

Recent Expenses (${(recentExpenses ?? []).length}):
${JSON.stringify((recentExpenses ?? []).slice(0, 20), null, 2)}

Projects (${(projects ?? []).length} total):
${JSON.stringify((projects ?? []).slice(0, 20), null, 2)}

Tasks (${(tasks ?? []).length} total, by status: ${JSON.stringify(Object.fromEntries(tasksByStatus))}):
Overdue tasks: ${overdueTasks}

Leads (${(leads ?? []).length} total):
${JSON.stringify((leads ?? []).slice(0, 15), null, 2)}

Opportunities (${(opportunities ?? []).length} total, pipeline value: $${pipelineValue.toFixed(2)}):
${JSON.stringify((opportunities ?? []).slice(0, 15), null, 2)}

Customer Count: ${customerCount ?? 0}

Generate a comprehensive executive summary.`;

  try {
    const result = await callAiForJson<Record<string, unknown>>(systemPrompt, userPrompt);
    return ok("executive_summary", JSON.stringify(result, null, 2), {
      executiveSummary: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("executive_summary", `Failed to generate executive summary: ${message}`);
  }
}

async function handleExecutiveSummary(
  data: BusinessAssistantRequest,
): Promise<BusinessAssistantResponse> {
  return await generateExecutiveSummary(data.workspaceId);
}
