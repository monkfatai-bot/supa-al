import type { Expense } from "@/types/generated/database";

/** Request body for creating a new expense. */
export interface CreateExpenseRequest {
  workspaceId: string;
  category: string;
  amount: number;
  currency?: string;
  description?: string;
  vendor?: string;
  expenseDate?: string;
  receiptUrl?: string;
  tags?: string[];
}

/** Expense joined with its optional budget info. */
export type ExpenseWithBudget = Expense & {
  budget?: {
    name: string;
    amount: number;
    spent: number;
  };
};

/** Aggregated dashboard statistics for expenses. */
export interface ExpenseDashboardStats {
  totalThisMonth: number;
  byCategory: { category: string; amount: number }[];
  pendingCount: number;
  pendingAmount: number;
}

/** Request body for AI-based expense categorization. */
export interface AiCategorizeRequest {
  description: string;
  vendor?: string;
  amount: number;
}

/** AI categorization result. */
export interface AiCategorizeResult {
  category: string;
  confidence: number;
  reasoning: string;
}

/** Paginated expense list response. */
export interface ExpenseListResponse {
  data: ExpenseWithBudget[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filters for the expense list query. */
export interface ExpenseListFilters {
  page?: number;
  pageSize?: number;
  category?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Standard action response. */
export interface ExpenseActionResponse {
  success: boolean;
  message: string;
  error?: string;
}
