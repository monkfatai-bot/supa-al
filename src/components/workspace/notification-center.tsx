"use client";

import { useState, useCallback } from "react";
import {
  Bell,
  CheckCheck,
  Trash2,
  Info,
  Users,
  Shield,
  CreditCard,
  AtSign,
  MessageSquare,
  Share,
  UserPlus,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "@/services/notification/actions";
import type { Notification } from "@/types/generated/database";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  system: <Info className="h-4 w-4 text-blue-500" />,
  workspace: <Users className="h-4 w-4 text-green-500" />,
  security: <Shield className="h-4 w-4 text-red-500" />,
  billing: <CreditCard className="h-4 w-4 text-amber-500" />,
  mention: <AtSign className="h-4 w-4 text-purple-500" />,
  comment: <MessageSquare className="h-4 w-4 text-cyan-500" />,
  document_share: <Share className="h-4 w-4 text-indigo-500" />,
  member_invite: <UserPlus className="h-4 w-4 text-teal-500" />,
  ai_task_complete: <Sparkles className="h-4 w-4 text-yellow-500" />,
  workspace_alert: <AlertTriangle className="h-4 w-4 text-orange-500" />,
};

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchData = useCallback(async () => {
    const notifs = await getNotifications(30, true);
    setNotifications(notifs);
  }, []);

  async function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open) {
      await fetchData();
    }
  }

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    await fetchData();
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    await fetchData();
  }

  async function handleDelete(id: string) {
    await deleteNotification(id);
    await fetchData();
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="bg-destructive text-destructive-foreground absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={handleMarkAllRead}
              >
                <CheckCheck className="mr-1 h-3 w-3" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Bell className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground mt-2 text-sm">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`group relative px-4 py-3 transition-colors hover:bg-accent ${!n.is_read ? "bg-accent/50" : ""}`}
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => handleMarkRead(n.id)}
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      {TYPE_ICONS[n.type] ?? <Info className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{n.title}</p>
                        {!n.is_read && (
                          <div className="bg-primary mt-1 h-2 w-2 shrink-0 rounded-full" />
                        )}
                      </div>
                      {n.message && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{n.message}</p>
                      )}
                      <p className="text-muted-foreground mt-1 text-[10px]">{formatTime(n.created_at)}</p>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(n.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
