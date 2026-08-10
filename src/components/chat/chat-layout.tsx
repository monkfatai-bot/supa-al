"use client";

import { useState, type ReactNode } from "react";
import { ConversationSidebar } from "./conversation-sidebar";
import { cn } from "@/lib/utils";
import type { ConversationWithMessageCount } from "@/services/chat";

interface ChatLayoutProps {
  children: ReactNode | ((sidebarOpen: boolean, onToggleSidebar: () => void) => ReactNode);
  conversations: ConversationWithMessageCount[];
  activeConversationId?: string;
}

export function ChatLayout({
  children,
  conversations,
  activeConversationId,
}: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = () => setSidebarOpen((o) => !o);

  const content = typeof children === "function" ? children(sidebarOpen, toggleSidebar) : children;

  return (
    <div className="flex h-full">
      <div
        className={cn(
          "shrink-0 overflow-hidden border-r transition-all duration-200",
          sidebarOpen ? "w-72" : "w-0 border-r-0"
        )}
      >
        <div className="w-72">
          <ConversationSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
          />
        </div>
      </div>
      <div className="flex-1 min-w-0">{content}</div>
    </div>
  );
}
