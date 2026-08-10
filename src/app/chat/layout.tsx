import { ChatHeader } from "@/components/chat/chat-header";
import { requireAuth } from "@/services/auth/session";

export const metadata = {
  title: "Chat",
  description: "Chat with AI assistants powered by Supa AI.",
};

interface ChatLayoutProps {
  children: React.ReactNode;
}

export default async function ChatLayout({ children }: ChatLayoutProps) {
  const profile = await requireAuth();

  return (
    <div className="flex h-screen flex-col">
      <ChatHeader
        userName={profile.full_name}
        userEmail={profile.id}
        avatarUrl={profile.avatar_url}
      />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
