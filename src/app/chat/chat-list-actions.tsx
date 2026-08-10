"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createConversation } from "@/services/chat/actions";

export function ChatListActions() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleNewChat() {
    startTransition(async () => {
      const result = await createConversation();
      if (result.success && result.conversation) {
        router.push(`/chat/${result.conversation.id}`);
      }
    });
  }

  return (
    <Button
      className="mt-6"
      size="lg"
      onClick={handleNewChat}
      disabled={isPending}
    >
      <MessageSquarePlus className="mr-2 h-4 w-4" />
      New Chat
    </Button>
  );
}
