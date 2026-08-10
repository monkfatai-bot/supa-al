// ── Actions ──────────────────────────────────────────────────────────────────

export {
  // Companies
  createCompany,
  updateCompany,
  deleteCompany,
  getCompanies,
  getCompany,
  // Contacts
  createContact,
  updateContact,
  deleteContact,
  getContacts,
  getContact,
  // Customers
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomers,
  getCustomer,
  // Leads
  createLead,
  updateLead,
  deleteLead,
  getLeads,
  getLead,
  updateLeadStatus,
  convertLeadToCustomer,
  // Opportunities
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  getOpportunities,
  getOpportunity,
  updateOpportunityStage,
  getPipelineSummary,
  // AI
  aiScoreLead,
} from "./actions";

// ── Types ────────────────────────────────────────────────────────────────────

export type {
  CrmActionResponse,
  CompanyWithContacts,
  CustomerWithCompany,
  LeadWithRelations,
  OpportunityWithRelations,
  PipelineSummary,
  LeadScoreRequest,
  AiLeadScoringResult,
  CompanyListOptions,
  ContactListOptions,
  CustomerListOptions,
  LeadListOptions,
  OpportunityListOptions,
  PaginatedResponse,
  GetOneResponse,
} from "./types";

export type {
  Company,
  Contact,
  Customer,
  Lead,
  Opportunity,
  OpportunityStage,
  LeadStatus,
  LeadSource,
} from "./types";
