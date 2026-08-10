import { describe, it, expect } from "vitest";
import type {
  ChatActionResponse,
  SendMessageResponse,
  CreateConversationResponse,
} from "@/services/chat/types";

describe("Chat Types", () => {
  it("ChatActionResponse has correct shape", () => {
    const success: ChatActionResponse = { success: true, message: "Done" };
    expect(success.success).toBe(true);

    const failure: ChatActionResponse = {
      success: false,
      message: "Error",
      error: "SOME_ERROR",
    };
    expect(failure.error).toBe("SOME_ERROR");
  });

  it("CreateConversationResponse extends ChatActionResponse", () => {
    const resp: CreateConversationResponse = {
      success: true,
      message: "Created",
      conversation: {
        id: "conv-1",
        user_id: "user-1",
        title: "New Chat",
        model_id: "gpt-4o-mini",
        provider: "openai",
        is_archived: false,
        is_pinned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
    expect(resp.conversation?.id).toBe("conv-1");
  });

  it("SendMessageResponse includes optional assistant message and title", () => {
    const resp: SendMessageResponse = {
      success: true,
      message: "Sent",
      assistantMessage: {
        id: "msg-1",
        conversation_id: "conv-1",
        role: "assistant",
        content: "Hello!",
        provider: "openai",
        model: "gpt-4o-mini",
        input_tokens: 10,
        output_tokens: 5,
        created_at: new Date().toISOString(),
      },
      conversationTitle: "New conversation title",
    };
    expect(resp.assistantMessage?.content).toBe("Hello!");
    expect(resp.conversationTitle).toBe("New conversation title");
  });
});
