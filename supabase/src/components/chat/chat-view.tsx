"use client";

/**
 * Supa AI — Chat view (Phase 3, top-level container).
 *
 * The dashboard section rendered for `'chat'` by the
 * `SectionRouter`. Composes the two-pane layout:
 *
 *   - `<ChatSidebar>` (280px on desktop; `<Sheet>` on mobile).
 *   - `<ChatWindow>` (fills the rest).
 *
 * Owns the high-level wiring:
 *
 *   - The active conversation id (from {@link useChatStore}).
 *   - The selected provider + model (also from the store — these are
 *     initialized by {@link ModelPicker} once `/api/chat/models`
 *     resolves).
 *   - The streaming state via {@link useChatStream} — `sendMessage`,
 *     `regenerate`, `stopGeneration`, `isGenerating`,
 *     `partialMessage` are passed down to the window + composer.
 *   - The "create-on-send" flow: when the user sends their first
 *     message with no active conversation, the view first creates a
 *     conversation via `useCreateConversation`, then sends the
 *     message into it.
 *
 * @module @/components/chat/chat-view
 */
import * as React from "react";

import { useChatStore } from "@/stores/chat-store";
import { useChatStream, type StreamResult } from "@/hooks/use-chat-stream";
import { useCreateConversation } from "@/hooks/use-chat";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { ChatSidebar } from "./chat-sidebar";
import { ChatWindow } from "./chat-window";

/** The dashboard section component. Drop-in for the `'chat'` section. */
export function ChatView() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);
  const selectedProvider = useChatStore((s) => s.selectedProvider);
  const selectedModel = useChatStore((s) => s.selectedModel);

  const stream = useChatStream();
  const createConversation = useCreateConversation();

  /**
   * Send a message. If no conversation is active, create one first
   * (with the selected provider + model baked in), then send the
   * message into it.
   */
  const handleSend = React.useCallback(
    async (
      content: string,
      attachmentIds: string[],
    ): Promise<StreamResult> => {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const conversation = await createConversation.mutateAsync({
          provider: selectedProvider ?? undefined,
          model: selectedModel ?? undefined,
        });
        conversationId = conversation.id;
        setActiveConversation(conversation.id);
      }
      return stream.sendMessage(conversationId, {
        content,
        provider: selectedProvider ?? undefined,
        model: selectedModel ?? undefined,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      });
    },
    [
      activeConversationId,
      createConversation,
      selectedProvider,
      selectedModel,
      setActiveConversation,
      stream,
    ],
  );

  /** Regenerate from an assistant message id. */
  const handleRegenerate = React.useCallback(
    (messageId: string) =>
      stream.regenerate(
        messageId,
        activeConversationId ?? "",
        {
          provider: selectedProvider ?? undefined,
          model: selectedModel ?? undefined,
        },
      ),
    [activeConversationId, selectedProvider, selectedModel, stream],
  );

  /** Starter prompt from the empty state — bootstraps a new
   * conversation immediately. */
  const handleUseStarter = React.useCallback(
    (content: string) => {
      void handleSend(content, []);
    },
    [handleSend],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 w-full">
      {/* Desktop sidebar — persistent on md+. */}
      <aside
        className="hidden w-72 shrink-0 border-r md:block"
        aria-label="Conversations"
      >
        <ChatSidebar />
      </aside>

      {/* Mobile sidebar — Sheet. */}
      <Sheet open={sidebarOpen} onOpenChange={(o) => toggleSidebar(o)}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          <ChatSidebar onSelect={() => toggleSidebar(false)} />
        </SheetContent>
      </Sheet>

      {/* Main chat area. */}
      <ChatWindow
        conversationId={activeConversationId}
        onSend={handleSend}
        onRegenerate={handleRegenerate}
        onStop={stream.stopGeneration}
        isGenerating={stream.isGenerating}
        onOpenSidebar={() => toggleSidebar(true)}
        onUseStarter={handleUseStarter}
      />
    </div>
  );
}
