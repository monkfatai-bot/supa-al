/**
 * Supa AI — Phase 10 Business AI Suite — types.
 *
 * Client-safe domain types for the entire business module. Plain TS types
 * (no Zod, no `server-only`) so this file can be imported from Client
 * Components via {@link "@/lib/business/client"}.
 *
 * The DB-level row shapes live in `@/lib/supabase/types` (`Tables<'...'>`).
 * The types here are *aliases* for those row shapes plus a small set of
 * service-level DTOs (input shapes for create / update / list filters).
 *
 * @module @/lib/business/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Status / enum unions (mirror the CHECK constraints in
// 0010_phase8_business.sql)
// ---------------------------------------------------------------------------

/** Customer lifecycle status — see `customers.status` CHECK. */
export type CustomerStatus =
  | "active"
  | "inactive"
  | "lead"
  | "archived"
  | "blacklisted";

/** Customer type — see `customers.customer_type` CHECK. */
export type CustomerType =
  | "individual"
  | "business"
  | "enterprise"
  | "government"
  | "nonprofit";

/** Lead source — see `leads.source` CHECK. */
export type LeadSource =
  | "manual"
  | "website"
  | "referral"
  | "cold-outreach"
  | "event"
  | "ad"
  | "api"
  | "other";

/** Lead pipeline status — see `leads.status` CHECK. */
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

/** Opportunity stage — see `opportunities.stage` CHECK. */
export type OpportunityStage =
  | "prospecting"
  | "qualification"
  | "needs-analysis"
  | "proposal"
  | "negotiation"
  | "closed-won"
  | "closed-lost";

/** Invoice status — see `invoices.status` CHECK. */
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "partial"
  | "paid"
  | "overdue"
  | "void"
  | "cancelled";

/** Quotation status — see `quotations.status` CHECK. */
export type QuotationStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

/** Proposal status — see `proposals.status` CHECK. */
export type ProposalStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "archived";

/** Contract status — see `contracts.status` CHECK. */
export type ContractStatus =
  | "draft"
  | "sent"
  | "negotiation"
  | "signed"
  | "active"
  | "expired"
  | "terminated"
  | "cancelled";

/** Payment method — see `receipts.payment_method` CHECK. */
export type PaymentMethod =
  | "cash"
  | "card"
  | "bank-transfer"
  | "paypal"
  | "stripe"
  | "crypto"
  | "check"
  | "other";

/** Expense status — see `expenses.status` CHECK. */
export type ExpenseStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

/** Purchase order status — see `purchase_orders.status` CHECK. */
export type PurchaseOrderStatus =
  | "draft"
  | "sent"
  | "acknowledged"
  | "partial"
  | "received"
  | "cancelled";

/** Project status — see `projects.status` CHECK. */
export type ProjectStatus =
  | "planning"
  | "active"
  | "on-hold"
  | "completed"
  | "cancelled"
  | "archived";

/** Calendar event type — see `calendar_events.type` CHECK. */
export type CalendarEventType =
  | "event"
  | "meeting"
  | "reminder"
  | "deadline"
  | "task"
  | "milestone"
  | "other";

/** Transaction type — see `transactions.type` CHECK. */
export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "adjustment";

/** Transaction status — see `transactions.status` CHECK. */
export type TransactionStatus = "pending" | "cleared" | "void";

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

/** Full row of `customers`. */
export type Customer = Tables<"customers">;
/** Full row of `contacts`. */
export type Contact = Tables<"contacts">;
/** Full row of `leads`. */
export type Lead = Tables<"leads">;
/** Full row of `opportunities`. */
export type Opportunity = Tables<"opportunities">;
/** Full row of `invoices`. */
export type Invoice = Tables<"invoices">;
/** Full row of `quotations`. */
export type Quotation = Tables<"quotations">;
/** Full row of `proposals`. */
export type Proposal = Tables<"proposals">;
/** Full row of `contracts`. */
export type Contract = Tables<"contracts">;
/** Full row of `receipts`. */
export type Receipt = Tables<"receipts">;
/** Full row of `expenses`. */
export type Expense = Tables<"expenses">;
/** Full row of `products`. */
export type Product = Tables<"products">;
/** Full row of `suppliers`. */
export type Supplier = Tables<"suppliers">;
/** Full row of `purchase_orders`. */
export type PurchaseOrder = Tables<"purchase_orders">;
/** Full row of `projects`. */
export type Project = Tables<"projects">;
/** Full row of `calendar_events`. */
export type CalendarEvent = Tables<"calendar_events">;
/** Full row of `transactions`. */
export type Transaction = Tables<"transactions">;
/** Full row of `companies`. */
export type Company = Tables<"companies">;
/** Full row of `accounting_entries`. */
export type AccountingEntry = Tables<"accounting_entries">;

// ---------------------------------------------------------------------------
// Insert / Update aliases (used by the service layer).
// ---------------------------------------------------------------------------

export type CustomerInsert = TablesInsert<"customers">;
export type CustomerUpdate = TablesUpdate<"customers">;
export type ContactInsert = TablesInsert<"contacts">;
export type ContactUpdate = TablesUpdate<"contacts">;
export type LeadInsert = TablesInsert<"leads">;
export type LeadUpdate = TablesUpdate<"leads">;
export type OpportunityInsert = TablesInsert<"opportunities">;
export type OpportunityUpdate = TablesUpdate<"opportunities">;
export type InvoiceInsert = TablesInsert<"invoices">;
export type InvoiceUpdate = TablesUpdate<"invoices">;
export type QuotationInsert = TablesInsert<"quotations">;
export type QuotationUpdate = TablesUpdate<"quotations">;
export type ProposalInsert = TablesInsert<"proposals">;
export type ProposalUpdate = TablesUpdate<"proposals">;
export type ContractInsert = TablesInsert<"contracts">;
export type ContractUpdate = TablesUpdate<"contracts">;
export type ReceiptInsert = TablesInsert<"receipts">;
export type ReceiptUpdate = TablesUpdate<"receipts">;
export type ExpenseInsert = TablesInsert<"expenses">;
export type ExpenseUpdate = TablesUpdate<"expenses">;
export type ProductInsert = TablesInsert<"products">;
export type ProductUpdate = TablesUpdate<"products">;
export type SupplierInsert = TablesInsert<"suppliers">;
export type SupplierUpdate = TablesUpdate<"suppliers">;
export type PurchaseOrderInsert = TablesInsert<"purchase_orders">;
export type PurchaseOrderUpdate = TablesUpdate<"purchase_orders">;
export type ProjectInsert = TablesInsert<"projects">;
export type ProjectUpdate = TablesUpdate<"projects">;
export type CalendarEventInsert = TablesInsert<"calendar_events">;
export type CalendarEventUpdate = TablesUpdate<"calendar_events">;
export type TransactionInsert = TablesInsert<"transactions">;
export type TransactionUpdate = TablesUpdate<"transactions">;
export type CompanyInsert = TablesInsert<"companies">;
export type CompanyUpdate = TablesUpdate<"companies">;
export type AccountingEntryInsert = TablesInsert<"accounting_entries">;
export type AccountingEntryUpdate = TablesUpdate<"accounting_entries">;

// ---------------------------------------------------------------------------
// Service-level DTOs (input shapes accepted by the service methods)
// ---------------------------------------------------------------------------

/** Common list options accepted by every business service's `list`. */
export interface ListBusinessOptions {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

/** Input accepted by `CustomerService.create`. */
export interface CreateCustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  status?: CustomerStatus;
  customerType?: CustomerType;
  tags?: string[];
  avatarUrl?: string | null;
  address?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `CustomerService.update`. */
export interface UpdateCustomerInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  status?: CustomerStatus;
  customerType?: CustomerType;
  tags?: string[];
  avatarUrl?: string | null;
  address?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** Options accepted by `CustomerService.list`. */
export interface ListCustomersOptions extends ListBusinessOptions {
  customerType?: CustomerType;
}

/** Input accepted by `ContactService.create`. */
export interface CreateContactInput {
  customerId?: string | null;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  isPrimary?: boolean;
}

/** Input accepted by `ContactService.update`. */
export interface UpdateContactInput {
  customerId?: string | null;
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  isPrimary?: boolean;
}

/** Options accepted by `ContactService.list`. */
export interface ListContactsOptions extends ListBusinessOptions {
  customerId?: string;
}

/** Input accepted by `LeadService.create`. */
export interface CreateLeadInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: LeadSource;
  status?: LeadStatus;
  score?: number;
  assignedTo?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `LeadService.update`. */
export interface UpdateLeadInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: LeadSource;
  status?: LeadStatus;
  score?: number;
  assignedTo?: string | null;
  convertedToCustomerId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `OpportunityService.create`. */
export interface CreateOpportunityInput {
  customerId?: string | null;
  leadId?: string | null;
  name: string;
  amount?: number;
  stage?: OpportunityStage;
  probability?: number;
  expectedCloseDate?: string | null;
  assignedTo?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `OpportunityService.update`. */
export interface UpdateOpportunityInput {
  customerId?: string | null;
  leadId?: string | null;
  name?: string;
  amount?: number;
  stage?: OpportunityStage;
  probability?: number;
  expectedCloseDate?: string | null;
  assignedTo?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** A single line item on an invoice / quotation / PO. */
export interface LineItem {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** Input accepted by `InvoiceService.create`. */
export interface CreateInvoiceInput {
  customerId?: string | null;
  number?: string;
  status?: InvoiceStatus;
  issueDate?: string;
  dueDate?: string | null;
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  currency?: string;
  notes?: string | null;
  items?: LineItem[];
}

/** Input accepted by `InvoiceService.update`. */
export interface UpdateInvoiceInput {
  customerId?: string | null;
  number?: string;
  status?: InvoiceStatus;
  issueDate?: string;
  dueDate?: string | null;
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  currency?: string;
  notes?: string | null;
  items?: LineItem[];
}

/** Result of `InvoiceService.computeInvoiceTotals`. */
export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

/** Input accepted by `QuotationService.create`. */
export interface CreateQuotationInput {
  customerId?: string | null;
  number?: string;
  status?: QuotationStatus;
  validUntil?: string | null;
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  currency?: string;
  items?: LineItem[];
  notes?: string | null;
}

/** Input accepted by `QuotationService.update`. */
export interface UpdateQuotationInput {
  customerId?: string | null;
  number?: string;
  status?: QuotationStatus;
  validUntil?: string | null;
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  currency?: string;
  items?: LineItem[];
  notes?: string | null;
}

/** Input accepted by `ProposalService.create`. */
export interface CreateProposalInput {
  customerId?: string | null;
  title: string;
  content?: string | null;
  status?: ProposalStatus;
  expiredAt?: string | null;
}

/** Input accepted by `ProposalService.update`. */
export interface UpdateProposalInput {
  customerId?: string | null;
  title?: string;
  content?: string | null;
  status?: ProposalStatus;
  sentAt?: string | null;
  acceptedAt?: string | null;
  expiredAt?: string | null;
}

/** Input accepted by `ContractService.create`. */
export interface CreateContractInput {
  customerId?: string | null;
  title: string;
  content?: string | null;
  status?: ContractStatus;
  startDate?: string | null;
  endDate?: string | null;
  value?: number;
}

/** Input accepted by `ContractService.update`. */
export interface UpdateContractInput {
  customerId?: string | null;
  title?: string;
  content?: string | null;
  status?: ContractStatus;
  startDate?: string | null;
  endDate?: string | null;
  value?: number;
  signedAt?: string | null;
}

/** Input accepted by `ReceiptService.create`. */
export interface CreateReceiptInput {
  customerId?: string | null;
  invoiceId?: string | null;
  number?: string;
  amount?: number;
  paymentMethod?: PaymentMethod;
  paymentDate?: string;
  notes?: string | null;
}

/** Input accepted by `ReceiptService.update`. */
export interface UpdateReceiptInput {
  customerId?: string | null;
  invoiceId?: string | null;
  number?: string;
  amount?: number;
  paymentMethod?: PaymentMethod;
  paymentDate?: string;
  notes?: string | null;
}

/** Input accepted by `ExpenseService.create`. */
export interface CreateExpenseInput {
  category?: string;
  amount?: number;
  currency?: string;
  date?: string;
  vendor?: string | null;
  description?: string | null;
  status?: ExpenseStatus;
  receiptUrl?: string | null;
}

/** Input accepted by `ExpenseService.update`. */
export interface UpdateExpenseInput {
  category?: string;
  amount?: number;
  currency?: string;
  date?: string;
  vendor?: string | null;
  description?: string | null;
  status?: ExpenseStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  receiptUrl?: string | null;
}

/** Input accepted by `ProductService.create`. */
export interface CreateProductInput {
  name: string;
  sku?: string | null;
  description?: string | null;
  price?: number;
  cost?: number;
  currency?: string;
  stock?: number;
  category?: string | null;
  tags?: string[];
  isActive?: boolean;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `ProductService.update`. */
export interface UpdateProductInput {
  name?: string;
  sku?: string | null;
  description?: string | null;
  price?: number;
  cost?: number;
  currency?: string;
  stock?: number;
  category?: string | null;
  tags?: string[];
  isActive?: boolean;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `SupplierService.create`. */
export interface CreateSupplierInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  contactPerson?: string | null;
  terms?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `SupplierService.update`. */
export interface UpdateSupplierInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  contactPerson?: string | null;
  terms?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `PurchaseOrderService.create`. */
export interface CreatePurchaseOrderInput {
  supplierId?: string | null;
  number?: string;
  status?: PurchaseOrderStatus;
  issueDate?: string;
  expectedDate?: string | null;
  subtotal?: number;
  tax?: number;
  total?: number;
  currency?: string;
  items?: LineItem[];
}

/** Input accepted by `PurchaseOrderService.update`. */
export interface UpdatePurchaseOrderInput {
  supplierId?: string | null;
  number?: string;
  status?: PurchaseOrderStatus;
  issueDate?: string;
  expectedDate?: string | null;
  subtotal?: number;
  tax?: number;
  total?: number;
  currency?: string;
  items?: LineItem[];
}

/** Input accepted by `ProjectService.create`. */
export interface CreateProjectInput {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number;
  clientId?: string | null;
  managerId?: string | null;
  team?: Array<Record<string, unknown>>;
  progress?: number;
}

/** Input accepted by `ProjectService.update`. */
export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number;
  clientId?: string | null;
  managerId?: string | null;
  team?: Array<Record<string, unknown>>;
  progress?: number;
}

/** Input accepted by `CalendarEventService.create`. */
export interface CreateCalendarEventInput {
  title: string;
  description?: string | null;
  type?: CalendarEventType;
  startTime?: string;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  attendees?: Array<Record<string, unknown>>;
  reminderMinutes?: number;
  recurrence?: Record<string, unknown> | null;
}

/** Input accepted by `CalendarEventService.update`. */
export interface UpdateCalendarEventInput {
  title?: string;
  description?: string | null;
  type?: CalendarEventType;
  startTime?: string;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  attendees?: Array<Record<string, unknown>>;
  reminderMinutes?: number;
  recurrence?: Record<string, unknown> | null;
}

/** Options accepted by `CalendarEventService.list`. */
export interface ListCalendarEventsOptions extends ListBusinessOptions {
  type?: CalendarEventType;
  dateFrom?: string;
  dateTo?: string;
}

/** Input accepted by `TransactionService.create`. */
export interface CreateTransactionInput {
  type: TransactionType;
  category?: string;
  amount?: number;
  currency?: string;
  date?: string;
  description?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  account?: string | null;
  status?: TransactionStatus;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `TransactionService.update`. */
export interface UpdateTransactionInput {
  type?: TransactionType;
  category?: string;
  amount?: number;
  currency?: string;
  date?: string;
  description?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  account?: string | null;
  status?: TransactionStatus;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `CompanyService.create`. */
export interface CreateCompanyInput {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  address?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
}

/** Input accepted by `CompanyService.update`. */
export interface UpdateCompanyInput {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  address?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
}

/** Input accepted by `AccountingService.createEntry`. */
export interface CreateAccountingEntryInput {
  date?: string;
  description?: string | null;
  debitAccount: string;
  creditAccount: string;
  amount?: number;
  currency?: string;
  referenceId?: string | null;
  referenceType?: string | null;
}

/** Input accepted by `AccountingService.updateEntry`. */
export interface UpdateAccountingEntryInput {
  date?: string;
  description?: string | null;
  debitAccount?: string;
  creditAccount?: string;
  amount?: number;
  currency?: string;
  referenceId?: string | null;
  referenceType?: string | null;
}

/** Options accepted by `ReportService.revenue` / `expenses`. */
export interface ReportRangeOptions {
  dateFrom?: string;
  dateTo?: string;
  currency?: string;
}

/** Aggregate shape returned by `ReportService.dashboard`. */
export interface BusinessDashboardStats {
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
  revenueThisMonth: number;
  revenueThisYear: number;
  expensesThisMonth: number;
  expensesThisYear: number;
  netThisMonth: number;
  productCount: number;
  activeProductCount: number;
  projectCount: number;
  activeProjectCount: number;
  calendarEventUpcomingCount: number;
}

/** Revenue breakdown returned by `ReportService.revenue`. */
export interface RevenueReport {
  total: number;
  byMonth: Array<{ month: string; total: number }>;
  byCustomer: Array<{ customerId: string | null; total: number }>;
}

/** Expenses breakdown returned by `ReportService.expenses`. */
export interface ExpenseReport {
  total: number;
  byMonth: Array<{ month: string; total: number }>;
  byCategory: Array<{ category: string; total: number }>;
}

/** Pipeline breakdown returned by `ReportService.pipeline`. */
export interface PipelineReport {
  totalValue: number;
  weightedValue: number;
  byStage: Array<{ stage: OpportunityStage; count: number; value: number }>;
  upcoming: Array<{ opportunity: Opportunity; daysUntilClose: number }>;
}

/** Result of `BusinessAIAssistant.ask`. */
export interface BusinessAiAnswer {
  answer: string;
  context: {
    customerCount: number;
    leadCount: number;
    opportunityCount: number;
    invoiceCount: number;
    monthRevenue: number;
    monthExpenses: number;
  };
  provider?: string;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/** JSON value type accepted by Postgres jsonb columns. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];
