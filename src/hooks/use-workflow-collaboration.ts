'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────

interface ActiveUser {
  id: string;
  name: string;
  avatar?: string;
  cursorPosition?: { x: number; y: number };
  color: string;
}

// ─── Color palette for cursors ────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────

/**
 * Subscribes to the Supabase Realtime `workflow_collaboration` channel
 * for the given workflow. Tracks active users and broadcasts cursor
 * position changes from the current browser tab.
 */
export function useWorkflowCollaboration(workflowId: string) {
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  useEffect(() => {
    if (!workflowId) return;

    const supabase = createClient();
    if (!supabase) {
      // Supabase not configured, collaboration unavailable
      return;
    }
    const channel = supabase
      .channel(`workflow:${workflowId}:collab`)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).map((entry, i) => {
          const e = (Array.isArray(entry) ? entry[0] : entry) as {
            id?: string;
            name?: string;
            avatar_url?: string;
            cursor?: { x: number; y: number };
          };
          return {
            id: e.id ?? 'unknown',
            name: e.name ?? 'Anonymous',
            avatar: e.avatar_url,
            cursorPosition: e.cursor,
            color: COLORS[i % COLORS.length],
          };
        });
        setActiveUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const {
            data: { user },
          } = await supabase.auth.getUser();
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
  }, [workflowId]);

  /** Broadcast the local user's cursor position to other collaborators. */
  const broadcastCursor = useCallback((position: { x: number; y: number }) => {
    channelRef.current?.track({
      cursor: position,
    });
  }, []);

  return { activeUsers, broadcastCursor };
}
