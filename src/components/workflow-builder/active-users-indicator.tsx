'use client';

import { useEffect, useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createClient } from '@/lib/supabase/client';

// ─── Types ──────────────────────────────────────────────

interface PresenceUser {
  id: string;
  name: string;
  avatar_url?: string;
  color: string;
}

// ─── Color palette (matches use-workflow-collaboration.ts) ──

const COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];

// ─── Props ──────────────────────────────────────────────

interface ActiveUsersIndicatorProps {
  workflowId: string;
}

// ─── Helpers ────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ─── Component ──────────────────────────────────────────

export function ActiveUsersIndicator({ workflowId }: ActiveUsersIndicatorProps) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    if (!workflowId) return;

    const supabase = createClient();
    if (!supabase) {
      // Supabase not configured, collaboration unavailable
      return;
    }

    // Get current user ID
    supabase.auth.getUser().then(({ data }) => {
      setMyId(data.user?.id ?? null);
    });

    const channel = supabase
      .channel(`workflow:${workflowId}:collab`)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const others: PresenceUser[] = [];
        let colorIdx = 0;

        for (const entry of Object.values(state)) {
          const e = (Array.isArray(entry) ? entry[0] : entry) as {
            id?: string;
            name?: string;
            avatar_url?: string;
          };

          if (!e.id) continue;

          // Skip ourselves
          if (e.id === myId) {
            colorIdx++;
            continue;
          }

          others.push({
            id: e.id,
            name: e.name ?? 'Anonymous',
            avatar_url: e.avatar_url,
            color: COLORS[colorIdx % COLORS.length],
          });
          colorIdx++;
        }

        setUsers(others);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: { user } } = await supabase.auth.getUser();
          await channel.track({
            id: user?.id ?? 'anon',
            name: user?.user_metadata?.full_name ?? '',
            avatar_url: user?.user_metadata?.avatar_url ?? '',
          });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, myId]);

  // Don't render if only current user is online
  if (users.length === 0) return null;

  // Show up to MAX_VISIBLE avatars, then "+N more"
  const MAX_VISIBLE = 4;
  const visible = users.slice(0, MAX_VISIBLE);
  const extraCount = users.length - MAX_VISIBLE;

  return (
    <div className="flex items-center -space-x-2" role="status" aria-label={`${users.length + 1} users collaborating`}>
      {visible.map((user) => (
        <Tooltip key={user.id}>
          <TooltipTrigger asChild>
            <Avatar
              className="h-7 w-7 border-2 border-background ring-2 ring-offset-0 transition-transform hover:scale-110"
              style={{ boxShadow: `0 0 0 2px ${user.color}` }}
            >
              <AvatarImage src={user.avatar_url} alt={user.name} />
              <AvatarFallback
                className="text-[10px] font-medium"
                style={{ backgroundColor: user.color, color: '#fff' }}
              >
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs font-medium">{user.name}</p>
            <p className="text-[10px] text-muted-foreground">Editing</p>
          </TooltipContent>
        </Tooltip>
      ))}

      {extraCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center h-7 w-7 rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
              +{extraCount}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {users
              .slice(MAX_VISIBLE)
              .map((u) => u.name)
              .join(', ')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
