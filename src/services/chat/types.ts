import type { Conversation, Message } from "@/types/generated/database";

export interface ConversationWithMessageCount extends Conversation {
  message_count: number;
}

export interface ChatActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface SendMessageResponse extends ChatActionResponse {
  assistantMessage?: Message;
  conversationTitle?: string;
}

export interface CreateConversationResponse extends ChatActionResponse {
  conversation?: Conversation;
}

export type { Conversation, Message };
