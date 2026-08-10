import type { AccountType, TransactionType, BudgetStatus } from "@/types/generated/database";

/** Request body for creating a new chart-of-accounts entry. */
export interface CreateAccountRequest {
  workspaceId: string;
  name: string;
  code: string;
  accountType: AccountType;
  description?: string;
  currency?: string;
  parentId?: string | null;
}

/** Request body for creating a new transaction. */
export interface CreateTransactionRequest {
  workspaceId: string;
  accountId: string;
  amount: number;
  currency?: string;
  transactionType: TransactionType;
  description?: string;
  referenceType?: string;
  oppositeAccountId?: string | null;
  referenceId?: string | null;
  transactionDate?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Request body for creating a new journal entry with lines. */
export interface CreateJournalEntryRequest {
  workspaceId: string;
  description: string;
  entryDate?: string;
  lines: {
    accountId: string;
    debit: number;
    credit: number;
    description?: string;
  }[];
}

/** Request body for creating a new budget. */
export interface CreateBudgetRequest {
  workspaceId: string;
  name: string;
  category: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  status?: BudgetStatus;
}

/** Filter parameters for listing transactions. */
export interface TransactionListFilters {
  page?: number;
  pageSize?: number;
  transactionType?: TransactionType;
  dateFrom?: string;
  dateTo?: string;
}

/** Filter parameters for listing accounts. */
export interface AccountListFilters {
  page?: number;
  pageSize?: number;
  accountType?: AccountType;
  activeOnly?: boolean;
}

/** Filter parameters for listing budgets. */
export interface BudgetListFilters {
  page?: number;
  pageSize?: number;
  status?: BudgetStatus;
}

/** Filter parameters for listing journal entries. */
export interface JournalEntryListFilters {
  page?: number;
  pageSize?: number;
}

/** Standard action response for mutations. */
export interface AccountingActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

/** Paginated list response with typed data. */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Income / expense breakdown line for P&L reports. */
export interface ProfitLossLine {
  categoryName: string;
  totalAmount: number;
}

/** Profit & Loss report structure. */
export interface ProfitLossReport {
  periodStart: string;
  periodEnd: string;
  revenue: ProfitLossLine[];
  totalRevenue: number;
  expenses: ProfitLossLine[];
  totalExpenses: number;
  netIncome: number;
}

/** Balance sheet line item grouped by account type. */
export interface BalanceSheetLine {
  accountName: string;
  accountCode: string;
  amount: number;
}

/** Balance sheet report structure. */
export interface BalanceSheetReport {
  asOfDate: string;
  assets: BalanceSheetLine[];
  totalAssets: number;
  liabilities: BalanceSheetLine[];
  totalLiabilities: number;
  equity: BalanceSheetLine[];
  totalEquity: number;
}

/** Cash flow report line item. */
export interface CashFlowLine {
  description: string;
  amount: number;
}

/** Cash flow report structure. */
export interface CashFlowReport {
  periodStart: string;
  periodEnd: string;
  operatingActivities: CashFlowLine[];
  totalOperating: number;
  investingActivities: CashFlowLine[];
  totalInvesting: number;
  financingActivities: CashFlowLine[];
  totalFinancing: number;
  netCashFlow: number;
}

/** Top expense category entry for the dashboard. */
export interface TopExpenseCategory {
  category: string;
  amount: number;
}

/** Aggregated financial dashboard overview. */
export interface FinancialDashboard {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  cashBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
  topExpenseCategories: TopExpenseCategory[];
}
