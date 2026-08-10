import type {
  Contract,
  ContractType,
  ContractVersion,
  Json,
} from "@/types/generated/database";

/** Request payload for creating a new contract. */
export interface CreateContractRequest {
  workspaceId: string;
  customerId?: string | null;
  companyId?: string | null;
  title: string;
  contractType: ContractType;
  content?: string | null;
  summary?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  value?: number | null;
  terms?: string | null;
  variables?: Json | null;
  tags?: string[];
}

/** Request payload for AI-drafted contract. */
export interface AiDraftContractRequest {
  workspaceId: string;
  contractType: ContractType;
  description: string;
  parties?: string[];
}

/** Contract enriched with optional customer name and version history. */
export type ContractWithRelations = Contract & {
  customer?: { name: string } | null;
  versions?: ContractVersion[];
};

/** Paginated result for contracts. */
export interface ContractListResult {
  contracts: ContractWithRelations[];
  total: number;
  page: number;
  pageSize: number;
}

/** Action response wrapper for contract mutations. */
export interface ContractActionResponse {
  success: boolean;
  message: string;
  error?: string;
  contract?: Contract;
}
