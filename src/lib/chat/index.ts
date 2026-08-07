/**
 * Supa AI — Chat service barrel.
 *
 * Re-exports every Phase 3 chat service + type so callers can `import {
 * createChatService, createConversationService, ... } from "@/lib/chat"`.
 *
 * @module @/lib/chat
 */
import "server-only";

export {
  createConversationService,
  createConversationServiceAdmin,
  type Conversation,
  type CreateConversationInput,
  type ListConversationsOptions,
} from "./conversation-service";

export {
  createMessageService,
  requireConversationAccess,
  type Message,
  type MessageRole,
  type CreateMessageInput,
  type ListMessagesOptions,
} from "./message-service";

export {
  createChatService,
  type FileAttachment,
  type StreamResponseInput,
  type RegenerateInput,
} from "./chat-service";

export {
  createProviderHealthService,
  recordProviderOutcome,
  type ProviderHealth,
  type ProviderRequestOutcome,
} from "./provider-health";

export {
  createCreditsService,
  type CreditReason,
  type UsageSummary,
  type BalanceCheck,
  type BalanceMutation,
  type AiUsageInsert,
} from "./credits";

export {
  sseChunk,
  sseError,
  sseDone,
  iterableToSseStream,
  createSseResponse,
} from "./sse";
