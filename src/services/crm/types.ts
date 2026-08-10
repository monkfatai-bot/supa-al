import type {
  Company,
  Contact,
  Customer,
  Lead,
  Opportunity,
  OpportunityStage,
  LeadStatus,
  LeadSource,
} from "@/types/generated/database";

// ── Action response base ────────────────────────────────────────────────────

export interface CrmActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

// ── Enriched models ──────────────────────────────────────────────────────────

export interface CompanyWithContacts extends Company {
  contacts?: Contact[];
}

export interface CustomerWithCompany extends Customer {
  company?: Company;
  contact?: Contact;
}

export interface LeadWithRelations extends Lead {
  company?: Company;
  contact?: Contact;
  assignee?: { full_name: string | null; avatar_url: string | null };
}

export interface OpportunityWithRelations extends Opportunity {
  company?: Company;
  contact?: Contact;
  assignee?: { full_name: string | null };
}

// ── Pipeline summary ─────────────────────────────────────────────────────────

export interface PipelineSummary {
  stage: OpportunityStage;
  count: number;
  value: number;
}

// ── AI lead scoring ─────────────────────────────────────────────────────────

export interface LeadScoreRequest {
  leadId: string;
  workspaceId: string;
}

export interface AiLeadScoringResult {
  leadId: string;
  score: number;
  reasoning: string;
  suggestions: string[];
}

// ── List filters & options ──────────────────────────────────────────────────

export interface CompanyListOptions {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface ContactListOptions {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  companyId?: string;
}

export interface CustomerListOptions {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

export interface LeadListOptions {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  status?: LeadStatus;
  source?: LeadSource;
  assignedTo?: string;
}

export interface OpportunityListOptions {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  stage?: OpportunityStage;
  assignedTo?: string;
}

// ── Paginated list response ────────────────────────────────────────────────

export interface PaginatedResponse<T> extends CrmActionResponse {
  data?: T[];
  total?: number;
}

export interface GetOneResponse<T> extends CrmActionResponse {
  record?: T;
}

// ── Re-export generated types for convenience ────────────────────────────────

export type {
  Company,
  Contact,
  Customer,
  Lead,
  Opportunity,
  OpportunityStage,
  LeadStatus,
  LeadSource,
};
