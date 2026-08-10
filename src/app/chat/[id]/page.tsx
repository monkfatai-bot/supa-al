import { notFound } from "next/navigation";
import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatWindow } from "@/components/chat/chat-window";
import {
  getConversations,
  getConversation,
} from "@/services/chat/actions";

export const dynamic = "force-dynamic";

interface ChatConversationPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatConversationPage({
  params,
}: ChatConversationPageProps) {
  const { id } = await params;
  const [conversations, conversationData] = await Promise.all([
    getConversations(),
    getConversation(id),
  ]);

  if (!conversationData) {
    notFound();
  }

  const { conversation, messages } = conversationData;

  return (
    <ChatLayout
      conversations={conversations}
      activeConversationId={conversation.id}
    >
      {(sidebarOpen, onToggleSidebar) => (
        <ChatWindow
          conversationId={conversation.id}
          initialMessages={messages}
          modelId={conversation.model_id}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
        />
      )}
    </ChatLayout>
  );
}
