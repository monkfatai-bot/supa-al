/**
 * Supa AI — Chat component barrel (Phase 3).
 *
 * Re-exports every chat surface component so callers can
 * `import { ChatView } from "@/components/chat"`.
 *
 * @module @/components/chat
 */
export { ChatView } from "./chat-view";
export type { ChatView as ChatViewType } from "./chat-view";
export { ChatSidebar } from "./chat-sidebar";
export type { ChatSidebarProps } from "./chat-sidebar";
export { ChatWindow } from "./chat-window";
export type { ChatWindowProps } from "./chat-window";
export { MessageList } from "./message-list";
export type { MessageListProps } from "./message-list";
export { MessageBubble } from "./message-bubble";
export type { MessageBubbleProps } from "./message-bubble";
export { MarkdownRenderer } from "./markdown-renderer";
export type { MarkdownRendererProps } from "./markdown-renderer";
export { ChatComposer } from "./chat-composer";
export type { ChatComposerProps } from "./chat-composer";
export { ModelPicker } from "./model-picker";
export type { ModelPickerProps } from "./model-picker";
export { PromptTemplatePicker } from "./prompt-template-picker";
export type { PromptTemplatePickerProps } from "./prompt-template-picker";
