"use client";

import { useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "@/services/notification/actions";
import { getUnreadNotificationCount } from "@/services/activity-log/actions";
import type { Notification } from "@/types/generated/database";

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const fetchData = useCallback(async () => {
    const [notifs, count] = await Promise.all([
      getNotifications(20, false),
      getUnreadNotificationCount(),
    ]);
    setNotifications(notifs);
    setUnreadCount(count);
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

  function formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

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
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[300px]">
          {notifications.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">No notifications</p>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-accent ${!n.is_read ? "bg-accent/50" : ""}`}
                  onClick={() => handleMarkRead(n.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      {n.message && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{n.message}</p>
                      )}
                      <p className="text-muted-foreground mt-1 text-[10px]">{formatTime(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <div className="bg-primary mt-1 h-2 w-2 shrink-0 rounded-full" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
