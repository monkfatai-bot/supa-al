/**
 * Supa AI — Phase 10 Business AI Suite — full barrel (server-only).
 *
 * Re-exports the client-safe types *plus* every server-only service
 * factory. Importing this barrel from a Client Component will throw at
 * build time — client code MUST import from `@/lib/business/client`
 * instead.
 *
 * @module @/lib/business
 */
import "server-only";

export * from "./client";

// Core helpers (server-only).
export {
  assertMember,
  assertRole,
  assertCanWrite,
  assertCanAdmin,
  findMembership,
  slugify,
  toJson,
  toDbError,
  wrapUnexpected,
  notFound,
  validationError,
  WRITE_ROLES,
  ADMIN_ROLES,
  nextNumber,
  computeLineTotals,
  safeCount,
  type NumberKind,
  type PostgrestErrorLike,
} from "./core";

export {
  AuthorizationError,
  DatabaseError,
  NotFoundError,
  ValidationError,
} from "./core";

// CRM
export {
  CustomerService,
  ContactService,
  LeadService,
  OpportunityService,
  createCustomerService,
  createContactService,
  createLeadService,
  createOpportunityService,
} from "./crm-service";

// Sales docs
export {
  InvoiceService,
  createInvoiceService,
} from "./invoice-service";
export {
  QuotationService,
  createQuotationService,
} from "./quotation-service";
export {
  ProposalService,
  createProposalService,
} from "./proposal-service";
export {
  ContractService,
  createContractService,
} from "./contract-service";
export {
  ReceiptService,
  createReceiptService,
} from "./receipt-service";
export {
  ExpenseService,
  createExpenseService,
} from "./expense-service";

// Inventory
export {
  ProductService,
  SupplierService,
  PurchaseOrderService,
  createProductService,
  createSupplierService,
  createPurchaseOrderService,
} from "./inventory-service";

// Projects
export {
  ProjectService,
  createProjectService,
} from "./project-service";

// Calendar
export {
  CalendarEventService,
  createCalendarEventService,
} from "./calendar-service";

// Accounting
export {
  TransactionService,
  AccountingService,
  CompanyService,
  createTransactionService,
  createAccountingService,
  createCompanyService,
} from "./accounting-service";

// Reports + dashboard
export {
  ReportService,
  createReportService,
} from "./report-service";
export {
  BusinessDashboardService,
  createBusinessDashboardService,
} from "./dashboard-service";

// AI assistant
export {
  BusinessAIAssistant,
  createBusinessAIAssistant,
} from "./ai-assistant-service";
