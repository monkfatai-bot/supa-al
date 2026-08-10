export type {
  CreateProposalRequest,
  AiGenerateProposalRequest,
  ProposalWithCustomer,
  ProposalListResult,
  ProposalActionResponse,
} from "./types";

export {
  createProposal,
  updateProposal,
  deleteProposal,
  getProposals,
  getProposal,
  updateProposalStatus,
  aiGenerateProposal,
  convertProposalToContract,
} from "./actions";
