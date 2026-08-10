import type {
  Proposal,
  ProposalType,
} from "@/types/generated/database";

/** Request payload for creating a new proposal. */
export interface CreateProposalRequest {
  workspaceId: string;
  customerId?: string | null;
  companyId?: string | null;
  title: string;
  proposalType: ProposalType;
  content?: string | null;
  summary?: string | null;
  value?: number | null;
  validUntil?: string | null;
  tags?: string[];
}

/** Request payload for AI-generated proposal. */
export interface AiGenerateProposalRequest {
  workspaceId: string;
  customerId?: string | null;
  type: ProposalType;
  prompt: string;
  tone?: string;
}

/** Proposal enriched with optional customer name. */
export type ProposalWithCustomer = Proposal & {
  customer?: { name: string } | null;
};

/** Paginated result for proposals. */
export interface ProposalListResult {
  proposals: ProposalWithCustomer[];
  total: number;
  page: number;
  pageSize: number;
}

/** Action response wrapper for proposal mutations. */
export interface ProposalActionResponse {
  success: boolean;
  message: string;
  error?: string;
  proposal?: Proposal;
}
