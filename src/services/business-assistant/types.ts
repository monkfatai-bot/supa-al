/**
 * AI Business Assistant types.
 */

/** Supported business assistant actions. */
export type BusinessAssistantAction =
  | "generate_invoice"
  | "generate_proposal"
  | "analyze_sales"
  | "forecast_revenue"
  | "recommend_pricing"
  | "write_contract"
  | "create_quotation"
  | "generate_report"
  | "analyze_expenses"
  | "executive_summary";

/** Incoming request for the business assistant dispatcher. */
export interface BusinessAssistantRequest {
  workspaceId: string;
  action: BusinessAssistantAction;
  context?: Record<string, unknown>;
  prompt?: string;
}

/** Standardised response from every business assistant action. */
export interface BusinessAssistantResponse {
  success: boolean;
  content: string;
  action: BusinessAssistantAction;
  metadata?: Record<string, unknown>;
  error?: string;
}

/** Single data point in a revenue forecast series. */
export interface RevenueForecast {
  month: string;
  predicted: number;
  lower: number;
  upper: number;
}

/** AI-generated pricing recommendation for a single product. */
export interface PricingRecommendation {
  product: string;
  currentPrice: number;
  recommendedPrice: number;
  reasoning: string;
}

/** Full executive summary produced from workspace data. */
export interface ExecutiveSummary {
  overview: string;
  keyMetrics: { label: string; value: string }[];
  risks: string[];
  opportunities: string[];
  recommendations: string[];
}
