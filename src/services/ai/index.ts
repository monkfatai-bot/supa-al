/**
 * AI service barrel export.
 * Only exports types and the service function.
 * Provider adapters and registry are NOT re-exported to keep
 * the surface area small and prevent accidental client imports.
 */

export type {
  AIMessageRole,
  AIMessage,
  AIModelInfo,
  AIRequestConfig,
  AIResponse,
  AIError,
  AIStreamChunk,
  AIProviderAdapter,
  ModelCapabilities,
} from "./types";

export { sendChatMessage, streamChatMessage } from "./service";
export {
  AVAILABLE_MODELS,
  ENABLED_MODELS,
  getModelById,
  getModelsByProvider,
  getDefaultModel,
  getAvailableProviders,
  resolveProviderFromModel,
} from "./models";
