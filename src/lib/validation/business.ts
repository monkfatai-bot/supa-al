/**
 * Supa AI — Phase 10 Business AI Suite Zod schemas.
 *
 * Reusable validation rules for every Phase 10 business surface: CRM
 * (customers, contacts, leads, opportunities), sales docs (invoices,
 * quotations, proposals, contracts, receipts), finance (expenses,
 * transactions, accounting entries), inventory (products, suppliers,
 * purchase orders), operations (projects, calendar), and the workspace's
 * own company profile. Infer types from these schemas so the runtime
 * contract and the TypeScript type can never drift apart.
 *
 * @module @/lib/validation/business
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums (mirror the CHECK constraints in 0010_phase8_business.sql)
// ---------------------------------------------------------------------------

export const customerStatusSchema = z.enum([
  "active",
  "inactive",
  "lead",
  "archived",
  "blacklisted",
]);

export const customerTypeSchema = z.enum([
  "individual",
  "business",
  "enterprise",
  "government",
  "nonprofit",
]);

export const leadSourceSchema = z.enum([
  "manual",
  "website",
  "referral",
  "cold-outreach",
  "event",
  "ad",
  "api",
  "other",
]);

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

export const opportunityStageSchema = z.enum([
  "prospecting",
  "qualification",
  "needs-analysis",
  "proposal",
  "negotiation",
  "closed-won",
  "closed-lost",
]);

export const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "viewed",
  "partial",
  "paid",
  "overdue",
  "void",
  "cancelled",
]);

export const quotationStatusSchema = z.enum([
  "draft",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
]);

export const proposalStatusSchema = z.enum([
  "draft",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "archived",
]);

export const contractStatusSchema = z.enum([
  "draft",
  "sent",
  "negotiation",
  "signed",
  "active",
  "expired",
  "terminated",
  "cancelled",
]);

export const paymentMethodSchema = z.enum([
  "cash",
  "card",
  "bank-transfer",
  "paypal",
  "stripe",
  "crypto",
  "check",
  "other",
]);

export const expenseStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "paid",
  "cancelled",
]);

export const purchaseOrderStatusSchema = z.enum([
  "draft",
  "sent",
  "acknowledged",
  "partial",
  "received",
  "cancelled",
]);

export const projectStatusSchema = z.enum([
  "planning",
  "active",
  "on-hold",
  "completed",
  "cancelled",
  "archived",
]);

export const calendarEventTypeSchema = z.enum([
  "event",
  "meeting",
  "reminder",
  "deadline",
  "task",
  "milestone",
  "other",
]);

export const transactionTypeSchema = z.enum([
  "income",
  "expense",
  "transfer",
  "adjustment",
]);

export const transactionStatusSchema = z.enum([
  "pending",
  "cleared",
  "void",
]);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const uuidSchema = z
  .string()
  .trim()
  .min(1, "ID is required.")
  .max(120);

const workspaceIdSchema = uuidSchema;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(200, "Name must be at most 200 characters.");

const shortNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(120, "Name must be at most 120 characters.");

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(300, "Title must be at most 300 characters.");

const emailSchema = z
  .string()
  .trim()
  .max(200, "Email must be at most 200 characters.")
  .email("Please provide a valid email address.")
  .nullable()
  .optional();

const phoneSchema = z
  .string()
  .trim()
  .max(60, "Phone must be at most 60 characters.")
  .nullable()
  .optional();

const urlSchema = z
  .string()
  .trim()
  .max(500, "URL must be at most 500 characters.")
  .url("Please provide a valid URL.")
  .nullable()
  .optional();

const stringArraySchema = z
  .array(z.string().trim().min(1).max(120))
  .max(100)
  .optional();

const moneySchema = z
  .number()
  .min(0, "Amount must be at least 0.")
  .max(1_000_000_000_000, "Amount is too large.");

const percentSchema = z
  .number()
  .int()
  .min(0, "Value must be at least 0.")
  .max(100, "Value must be at most 100.");

const scoreSchema = z
  .number()
  .int()
  .min(0, "Score must be at least 0.")
  .max(100, "Score must be at most 100.");

const currencySchema = z
  .string()
  .trim()
  .min(3, "Currency must be a 3-letter code.")
  .max(3, "Currency must be a 3-letter code.")
  .toUpperCase()
  .optional();

const dateSchema = z
  .string()
  .trim()
  .min(8, "Date must be a valid ISO date.")
  .max(40, "Date must be a valid ISO date.");

const dateTimeSchema = z
  .string()
  .trim()
  .min(8, "Timestamp must be a valid ISO datetime.")
  .max(40, "Timestamp must be a valid ISO datetime.");

const metadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional();

const descriptionSchema = z
  .string()
  .trim()
  .max(8000, "Description must be at most 8000 characters.")
  .nullable()
  .optional();

const lineItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).nullable().optional(),
    quantity: z.number().min(0),
    unitPrice: z.number().min(0),
    total: z.number().min(0),
  })
  .strict();

const lineItemsSchema = z.array(lineItemSchema).max(500).optional();

const limitSchema = z.coerce.number().int().min(1).max(200).optional();
const offsetSchema = z.coerce.number().int().min(0).optional();

const searchSchema = z.string().trim().max(200).optional();

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const createCustomerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    company: z.string().trim().max(200).nullable().optional(),
    status: customerStatusSchema.optional(),
    customerType: customerTypeSchema.optional(),
    tags: stringArraySchema,
    avatarUrl: urlSchema,
    address: metadataSchema,
    metadata: metadataSchema,
  })
  .strict();

export const updateCustomerSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema,
    phone: phoneSchema,
    company: z.string().trim().max(200).nullable().optional(),
    status: customerStatusSchema.optional(),
    customerType: customerTypeSchema.optional(),
    tags: stringArraySchema,
    avatarUrl: urlSchema,
    address: metadataSchema,
    metadata: metadataSchema,
  })
  .strict();

export const listCustomersQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: customerStatusSchema.optional(),
    customerType: customerTypeSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export const createContactSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    firstName: shortNameSchema,
    lastName: z.string().trim().max(120).nullable().optional(),
    email: emailSchema,
    phone: phoneSchema,
    title: z.string().trim().max(120).nullable().optional(),
    department: z.string().trim().max(120).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

export const updateContactSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    firstName: shortNameSchema.optional(),
    lastName: z.string().trim().max(120).nullable().optional(),
    email: emailSchema,
    phone: phoneSchema,
    title: z.string().trim().max(120).nullable().optional(),
    department: z.string().trim().max(120).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

export const listContactsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    customerId: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const createLeadSchema = z
  .object({
    name: shortNameSchema,
    email: emailSchema,
    phone: phoneSchema,
    company: z.string().trim().max(200).nullable().optional(),
    source: leadSourceSchema.optional(),
    status: leadStatusSchema.optional(),
    score: scoreSchema.optional(),
    assignedTo: uuidSchema.nullable().optional(),
    metadata: metadataSchema,
  })
  .strict();

export const updateLeadSchema = z
  .object({
    name: shortNameSchema.optional(),
    email: emailSchema,
    phone: phoneSchema,
    company: z.string().trim().max(200).nullable().optional(),
    source: leadSourceSchema.optional(),
    status: leadStatusSchema.optional(),
    score: scoreSchema.optional(),
    assignedTo: uuidSchema.nullable().optional(),
    convertedToCustomerId: uuidSchema.nullable().optional(),
    metadata: metadataSchema,
  })
  .strict();

export const listLeadsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: leadStatusSchema.optional(),
    source: leadSourceSchema.optional(),
    assignedTo: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export const createOpportunitySchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    leadId: uuidSchema.nullable().optional(),
    name: titleSchema,
    amount: moneySchema.optional(),
    stage: opportunityStageSchema.optional(),
    probability: percentSchema.optional(),
    expectedCloseDate: dateSchema.nullable().optional(),
    assignedTo: uuidSchema.nullable().optional(),
    metadata: metadataSchema,
  })
  .strict();

export const updateOpportunitySchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    leadId: uuidSchema.nullable().optional(),
    name: titleSchema.optional(),
    amount: moneySchema.optional(),
    stage: opportunityStageSchema.optional(),
    probability: percentSchema.optional(),
    expectedCloseDate: dateSchema.nullable().optional(),
    assignedTo: uuidSchema.nullable().optional(),
    metadata: metadataSchema,
  })
  .strict();

export const listOpportunitiesQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    stage: opportunityStageSchema.optional(),
    customerId: uuidSchema.optional(),
    assignedTo: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const createInvoiceSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    number: z.string().trim().min(1).max(80).optional(),
    status: invoiceStatusSchema.optional(),
    issueDate: dateSchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    subtotal: moneySchema.optional(),
    tax: moneySchema.optional(),
    discount: moneySchema.optional(),
    total: moneySchema.optional(),
    currency: currencySchema,
    notes: z.string().trim().max(4000).nullable().optional(),
    items: lineItemsSchema,
  })
  .strict();

export const updateInvoiceSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    number: z.string().trim().min(1).max(80).optional(),
    status: invoiceStatusSchema.optional(),
    issueDate: dateSchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    subtotal: moneySchema.optional(),
    tax: moneySchema.optional(),
    discount: moneySchema.optional(),
    total: moneySchema.optional(),
    currency: currencySchema,
    notes: z.string().trim().max(4000).nullable().optional(),
    items: lineItemsSchema,
  })
  .strict();

export const listInvoicesQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: invoiceStatusSchema.optional(),
    customerId: uuidSchema.optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------

export const createQuotationSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    number: z.string().trim().min(1).max(80).optional(),
    status: quotationStatusSchema.optional(),
    validUntil: dateSchema.nullable().optional(),
    subtotal: moneySchema.optional(),
    tax: moneySchema.optional(),
    discount: moneySchema.optional(),
    total: moneySchema.optional(),
    currency: currencySchema,
    items: lineItemsSchema,
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const updateQuotationSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    number: z.string().trim().min(1).max(80).optional(),
    status: quotationStatusSchema.optional(),
    validUntil: dateSchema.nullable().optional(),
    subtotal: moneySchema.optional(),
    tax: moneySchema.optional(),
    discount: moneySchema.optional(),
    total: moneySchema.optional(),
    currency: currencySchema,
    items: lineItemsSchema,
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const listQuotationsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: quotationStatusSchema.optional(),
    customerId: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export const createProposalSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    title: titleSchema,
    content: z.string().trim().max(50000).nullable().optional(),
    status: proposalStatusSchema.optional(),
    expiredAt: dateTimeSchema.nullable().optional(),
  })
  .strict();

export const updateProposalSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    title: titleSchema.optional(),
    content: z.string().trim().max(50000).nullable().optional(),
    status: proposalStatusSchema.optional(),
    sentAt: dateTimeSchema.nullable().optional(),
    acceptedAt: dateTimeSchema.nullable().optional(),
    expiredAt: dateTimeSchema.nullable().optional(),
  })
  .strict();

export const listProposalsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: proposalStatusSchema.optional(),
    customerId: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export const createContractSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    title: titleSchema,
    content: z.string().trim().max(50000).nullable().optional(),
    status: contractStatusSchema.optional(),
    startDate: dateSchema.nullable().optional(),
    endDate: dateSchema.nullable().optional(),
    value: moneySchema.optional(),
  })
  .strict();

export const updateContractSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    title: titleSchema.optional(),
    content: z.string().trim().max(50000).nullable().optional(),
    status: contractStatusSchema.optional(),
    startDate: dateSchema.nullable().optional(),
    endDate: dateSchema.nullable().optional(),
    value: moneySchema.optional(),
    signedAt: dateTimeSchema.nullable().optional(),
  })
  .strict();

export const listContractsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: contractStatusSchema.optional(),
    customerId: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export const createReceiptSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    invoiceId: uuidSchema.nullable().optional(),
    number: z.string().trim().min(1).max(80).optional(),
    amount: moneySchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    paymentDate: dateTimeSchema.optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const updateReceiptSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    invoiceId: uuidSchema.nullable().optional(),
    number: z.string().trim().min(1).max(80).optional(),
    amount: moneySchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    paymentDate: dateTimeSchema.optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const listReceiptsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    customerId: uuidSchema.optional(),
    invoiceId: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const createExpenseSchema = z
  .object({
    category: z.string().trim().max(80).optional(),
    amount: moneySchema.optional(),
    currency: currencySchema,
    date: dateSchema.optional(),
    vendor: z.string().trim().max(200).nullable().optional(),
    description: descriptionSchema,
    status: expenseStatusSchema.optional(),
    receiptUrl: urlSchema,
  })
  .strict();

export const updateExpenseSchema = z
  .object({
    category: z.string().trim().max(80).optional(),
    amount: moneySchema.optional(),
    currency: currencySchema,
    date: dateSchema.optional(),
    vendor: z.string().trim().max(200).nullable().optional(),
    description: descriptionSchema,
    status: expenseStatusSchema.optional(),
    approvedBy: uuidSchema.nullable().optional(),
    approvedAt: dateTimeSchema.nullable().optional(),
    receiptUrl: urlSchema,
  })
  .strict();

export const listExpensesQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: expenseStatusSchema.optional(),
    category: z.string().trim().max(80).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const createProductSchema = z
  .object({
    name: nameSchema,
    sku: z.string().trim().max(80).nullable().optional(),
    description: descriptionSchema,
    price: moneySchema.optional(),
    cost: moneySchema.optional(),
    currency: currencySchema,
    stock: z.number().int().min(0).optional(),
    category: z.string().trim().max(120).nullable().optional(),
    tags: stringArraySchema,
    isActive: z.boolean().optional(),
    metadata: metadataSchema,
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: nameSchema.optional(),
    sku: z.string().trim().max(80).nullable().optional(),
    description: descriptionSchema,
    price: moneySchema.optional(),
    cost: moneySchema.optional(),
    currency: currencySchema,
    stock: z.number().int().min(0).optional(),
    category: z.string().trim().max(120).nullable().optional(),
    tags: stringArraySchema,
    isActive: z.boolean().optional(),
    metadata: metadataSchema,
  })
  .strict();

export const listProductsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    category: z.string().trim().max(120).optional(),
    isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export const createSupplierSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    company: z.string().trim().max(200).nullable().optional(),
    contactPerson: z.string().trim().max(200).nullable().optional(),
    terms: z.string().trim().max(2000).nullable().optional(),
    metadata: metadataSchema,
  })
  .strict();

export const updateSupplierSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema,
    phone: phoneSchema,
    company: z.string().trim().max(200).nullable().optional(),
    contactPerson: z.string().trim().max(200).nullable().optional(),
    terms: z.string().trim().max(2000).nullable().optional(),
    metadata: metadataSchema,
  })
  .strict();

export const listSuppliersQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

export const createPurchaseOrderSchema = z
  .object({
    supplierId: uuidSchema.nullable().optional(),
    number: z.string().trim().min(1).max(80).optional(),
    status: purchaseOrderStatusSchema.optional(),
    issueDate: dateSchema.optional(),
    expectedDate: dateSchema.nullable().optional(),
    subtotal: moneySchema.optional(),
    tax: moneySchema.optional(),
    total: moneySchema.optional(),
    currency: currencySchema,
    items: lineItemsSchema,
  })
  .strict();

export const updatePurchaseOrderSchema = z
  .object({
    supplierId: uuidSchema.nullable().optional(),
    number: z.string().trim().min(1).max(80).optional(),
    status: purchaseOrderStatusSchema.optional(),
    issueDate: dateSchema.optional(),
    expectedDate: dateSchema.nullable().optional(),
    subtotal: moneySchema.optional(),
    tax: moneySchema.optional(),
    total: moneySchema.optional(),
    currency: currencySchema,
    items: lineItemsSchema,
  })
  .strict();

export const listPurchaseOrdersQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: purchaseOrderStatusSchema.optional(),
    supplierId: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const createProjectSchema = z
  .object({
    name: titleSchema,
    description: descriptionSchema,
    status: projectStatusSchema.optional(),
    startDate: dateSchema.nullable().optional(),
    endDate: dateSchema.nullable().optional(),
    budget: moneySchema.optional(),
    clientId: uuidSchema.nullable().optional(),
    managerId: uuidSchema.nullable().optional(),
    team: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    progress: percentSchema.optional(),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: titleSchema.optional(),
    description: descriptionSchema,
    status: projectStatusSchema.optional(),
    startDate: dateSchema.nullable().optional(),
    endDate: dateSchema.nullable().optional(),
    budget: moneySchema.optional(),
    clientId: uuidSchema.nullable().optional(),
    managerId: uuidSchema.nullable().optional(),
    team: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    progress: percentSchema.optional(),
  })
  .strict();

export const listProjectsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    status: projectStatusSchema.optional(),
    clientId: uuidSchema.optional(),
    managerId: uuidSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

export const createCalendarEventSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    type: calendarEventTypeSchema.optional(),
    startTime: dateTimeSchema.optional(),
    endTime: dateTimeSchema.nullable().optional(),
    allDay: z.boolean().optional(),
    location: z.string().trim().max(300).nullable().optional(),
    attendees: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
    reminderMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
    recurrence: metadataSchema,
  })
  .strict();

export const updateCalendarEventSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema,
    type: calendarEventTypeSchema.optional(),
    startTime: dateTimeSchema.optional(),
    endTime: dateTimeSchema.nullable().optional(),
    allDay: z.boolean().optional(),
    location: z.string().trim().max(300).nullable().optional(),
    attendees: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
    reminderMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
    recurrence: metadataSchema,
  })
  .strict();

export const listCalendarEventsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    type: calendarEventTypeSchema.optional(),
    dateFrom: dateTimeSchema.optional(),
    dateTo: dateTimeSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const createTransactionSchema = z
  .object({
    type: transactionTypeSchema,
    category: z.string().trim().max(120).optional(),
    amount: moneySchema.optional(),
    currency: currencySchema,
    date: dateSchema.optional(),
    description: descriptionSchema,
    referenceId: uuidSchema.nullable().optional(),
    referenceType: z.string().trim().max(80).nullable().optional(),
    account: z.string().trim().max(120).nullable().optional(),
    status: transactionStatusSchema.optional(),
    metadata: metadataSchema,
  })
  .strict();

export const updateTransactionSchema = z
  .object({
    type: transactionTypeSchema.optional(),
    category: z.string().trim().max(120).optional(),
    amount: moneySchema.optional(),
    currency: currencySchema,
    date: dateSchema.optional(),
    description: descriptionSchema,
    referenceId: uuidSchema.nullable().optional(),
    referenceType: z.string().trim().max(80).nullable().optional(),
    account: z.string().trim().max(120).nullable().optional(),
    status: transactionStatusSchema.optional(),
    metadata: metadataSchema,
  })
  .strict();

export const listTransactionsQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    type: transactionTypeSchema.optional(),
    status: transactionStatusSchema.optional(),
    category: z.string().trim().max(120).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export const createCompanySchema = z
  .object({
    name: nameSchema,
    legalName: z.string().trim().max(200).nullable().optional(),
    taxId: z.string().trim().max(80).nullable().optional(),
    email: emailSchema,
    phone: phoneSchema,
    website: urlSchema,
    logoUrl: urlSchema,
    address: metadataSchema,
    settings: metadataSchema,
  })
  .strict();

export const updateCompanySchema = z
  .object({
    name: nameSchema.optional(),
    legalName: z.string().trim().max(200).nullable().optional(),
    taxId: z.string().trim().max(80).nullable().optional(),
    email: emailSchema,
    phone: phoneSchema,
    website: urlSchema,
    logoUrl: urlSchema,
    address: metadataSchema,
    settings: metadataSchema,
  })
  .strict();

export const listCompaniesQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    search: searchSchema,
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Accounting entries
// ---------------------------------------------------------------------------

export const createAccountingEntrySchema = z
  .object({
    date: dateSchema.optional(),
    description: descriptionSchema,
    debitAccount: z.string().trim().min(1).max(120),
    creditAccount: z.string().trim().min(1).max(120),
    amount: moneySchema.optional(),
    currency: currencySchema,
    referenceId: uuidSchema.nullable().optional(),
    referenceType: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

export const updateAccountingEntrySchema = z
  .object({
    date: dateSchema.optional(),
    description: descriptionSchema,
    debitAccount: z.string().trim().min(1).max(120).optional(),
    creditAccount: z.string().trim().min(1).max(120).optional(),
    amount: moneySchema.optional(),
    currency: currencySchema,
    referenceId: uuidSchema.nullable().optional(),
    referenceType: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

export const listAccountingEntriesQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    account: z.string().trim().max(120).optional(),
    referenceId: uuidSchema.optional(),
    referenceType: z.string().trim().max(80).optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const reportQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    currency: currencySchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const dashboardQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// AI assistant
// ---------------------------------------------------------------------------

export const businessAiAskSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    question: z.string().trim().min(1, "Question is required.").max(4000),
  })
  .strict();

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;
export type CreateProposalInput = z.infer<typeof createProposalSchema>;
export type UpdateProposalInput = z.infer<typeof updateProposalSchema>;
export type ListProposalsQuery = z.infer<typeof listProposalsQuerySchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type ListCalendarEventsQuery = z.infer<typeof listCalendarEventsQuerySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;
export type CreateAccountingEntryInput = z.infer<typeof createAccountingEntrySchema>;
export type UpdateAccountingEntryInput = z.infer<typeof updateAccountingEntrySchema>;
export type ListAccountingEntriesQuery = z.infer<typeof listAccountingEntriesQuerySchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type BusinessAiAskInput = z.infer<typeof businessAiAskSchema>;
