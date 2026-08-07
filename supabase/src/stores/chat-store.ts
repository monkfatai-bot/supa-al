"use client";

/**
 * Supa AI — Chat UI state (Phase 3).
 *
 * A small Zustand store that holds the cross-component chat UI state:
 *
 *   - `activeConversationId` — which conversation is currently shown in
 *     `<ChatWindow>`. `null` means "no conversation selected" (the empty
 *     state with suggested prompt templates is rendered).
 *   - `selectedProvider` + `selectedModel` — which provider/model the
 *     next outbound message will be sent with. Initialized from the
 *     `/api/chat/models` defaults on mount; updated when the user picks
 *     a different model from `<ModelPicker>`.
 *   - `isGenerating` + `partialMessage` — owned by `useChatStream` but
 *     mirrored here so the composer / sidebar / window can all read
 *     them without prop-drilling. `partialMessage` is the
 *     in-flight assistant content accumulated from SSE deltas (or
 *     `null` when no stream is active).
 *   - `sidebarOpen` — mobile-only: controls the `<Sheet>` that wraps
 *     `<ChatSidebar>` on small screens.
 *
 * Persisted to `localStorage` so the user's last active conversation +
 * selected model survive a refresh. We deliberately do NOT persist
 * `isGenerating` / `partialMessage` / `streamingConversationId` — those
 * are session-only.
 *
 * @module @/stores/chat-store
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { AIProvider } from "@/lib/ai/types";

/** Shape of the chat UI store. */
export interface ChatStoreState {
  /** Currently-selected conversation id, or `null` when none is active. */
  activeConversationId: string | null;
  /** Provider the next outbound message will use. */
  selectedProvider: AIProvider | null;
  /** Model id the next outbound message will use. */
  selectedModel: string | null;
  /** True while an SSE stream is in flight. */
  isGenerating: boolean;
  /** In-flight assistant content (accumulated SSE deltas). */
  partialMessage: string | null;
  /** Mobile sidebar (Sheet) open state. */
  sidebarOpen: boolean;
  /** Conversation id the in-flight stream is bound to (so the UI knows
   * which window to render the partial into). */
  streamingConversationId: string | null;

  // --- Actions ---------------------------------------------------------

  setActiveConversation: (id: string | null) => void;
  setModel: (provider: AIProvider | null, model: string | null) => void;
  setGenerating: (
    generating: boolean,
    opts?: { conversationId?: string | null },
  ) => void;
  setPartialMessage: (content: string | null) => void;
  toggleSidebar: (open?: boolean) => void;
}

/** Subset of {@link ChatStoreState} that survives a page refresh. */
interface PersistedChatState {
  activeConversationId: string | null;
  selectedProvider: AIProvider | null;
  selectedModel: string | null;
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set) => ({
      activeConversationId: null,
      selectedProvider: null,
      selectedModel: null,
      isGenerating: false,
      partialMessage: null,
      sidebarOpen: false,
      streamingConversationId: null,

      setActiveConversation: (id) =>
        set({ activeConversationId: id }),

      setModel: (provider, model) =>
        set({ selectedProvider: provider, selectedModel: model }),

      setGenerating: (generating, opts) =>
        set({
          isGenerating: generating,
          // Bind / unbind the streaming conversation id.
          streamingConversationId: generating
            ? (opts?.conversationId ?? null)
            : null,
          // Clear the partial when generation stops (the persisted
          // assistant message takes over via the messages query).
          partialMessage: generating ? "" : null,
        }),

      setPartialMessage: (content) => set({ partialMessage: content }),

      toggleSidebar: (open) =>
        set((s) => ({ sidebarOpen: open ?? !s.sidebarOpen })),
    }),
    {
      name: "supa-ai.chat-ui",
      storage: createJSONStorage(() => localStorage),
      // Only persist the user-preference fields. Transient streaming
      // state never survives a refresh — a refresh always lands in a
      // clean "ready" state.
      partialize: (state): PersistedChatState => ({
        activeConversationId: state.activeConversationId,
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
      }),
      version: 1,
    },
  ),
);
