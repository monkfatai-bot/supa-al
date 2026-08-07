"use client";

/**
 * Supa AI — Phase 9C Employee UI state (Zustand).
 *
 * A small store that holds the cross-component employee UI state:
 *
 *   - `activeTab` — which top-level tab is currently shown in the
 *     EmployeesView container (`'directory' | 'manager' | 'marketplace'
 *     | 'training'`). Defaults to `'directory'`.
 *   - `selectedEmployeeId` — which employee is currently open in the
 *     profile drawer / details panel. `null` means "no selection".
 *   - `activeChatEmployeeId` — which employee the chat panel is
 *     currently bound to. `null` means the chat panel is closed.
 *
 * Persisted to `localStorage` so the user's last active tab + selected
 * employee survive a refresh. The `activeChatEmployeeId` is
 * deliberately NOT persisted — a refresh always lands in a clean
 * "chat closed" state (the in-flight chat history is owned by the
 * EmployeeChat component's local state).
 *
 * @module @/stores/employee-store
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Top-level tab in the EmployeesView container. */
export type EmployeeTab =
  | "directory"
  | "manager"
  | "marketplace"
  | "training"
  | "dashboard"
  | "training";

/** Shape of the employee UI store. */
export interface EmployeeStoreState {
  /** Currently-active top-level tab. */
  activeTab: EmployeeTab;
  /** Currently-selected employee id (profile drawer). */
  selectedEmployeeId: string | null;
  /** Employee id the chat panel is bound to. `null` = closed. */
  activeChatEmployeeId: string | null;

  // --- Actions ---------------------------------------------------------

  setActiveTab: (tab: EmployeeTab) => void;
  setSelectedEmployee: (id: string | null) => void;
  setActiveChatEmployee: (id: string | null) => void;
}

/** Subset of {@link EmployeeStoreState} that survives a refresh. */
interface PersistedEmployeeState {
  activeTab: EmployeeTab;
  selectedEmployeeId: string | null;
}

export const useEmployeeStore = create<EmployeeStoreState>()(
  persist(
    (set) => ({
      activeTab: "directory",
      selectedEmployeeId: null,
      activeChatEmployeeId: null,

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSelectedEmployee: (id) => set({ selectedEmployeeId: id }),
      setActiveChatEmployee: (id) => set({ activeChatEmployeeId: id }),
    }),
    {
      name: "supa-ai.employee-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedEmployeeState => ({
        activeTab: state.activeTab,
        selectedEmployeeId: state.selectedEmployeeId,
      }),
      version: 1,
    },
  ),
);
