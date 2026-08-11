'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ──────────────────────────────────────────────

interface RemoteCursor {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

// ─── Color palette ─────────────────────────────────────

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

interface CollaborationCursorOverlayProps {
  workflowId: string;
}

// ─── SVG Cursor Path ───────────────────────────────────

const CURSOR_SVG = (color: string) => `
  <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 1L6 18L8.5 10.5L15 8.5L1 1Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>
`;

// ─── Component ──────────────────────────────────────────

export function CollaborationCursorOverlay({ workflowId }: CollaborationCursorOverlayProps) {
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowId) return;

    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setMyId(data.user?.id ?? null);
    });

    const channel = supabase
      .channel(`workflow:${workflowId}:collab`)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const remoteCursors: RemoteCursor[] = [];
        let colorIdx = 0;

        for (const entry of Object.values(state)) {
          const e = (Array.isArray(entry) ? entry[0] : entry) as {
            id?: string;
            name?: string;
            cursor?: { x: number; y: number };
          };

          if (!e.id || e.id === myId) {
            if (e.id) colorIdx++;
            continue;
          }

          if (e.cursor) {
            remoteCursors.push({
              id: e.id,
              name: e.name ?? 'Anonymous',
              x: e.cursor.x,
              y: e.cursor.y,
              color: COLORS[colorIdx % COLORS.length],
            });
          }
          colorIdx++;
        }

        setCursors(remoteCursors);
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, myId]);

  if (cursors.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20"
      aria-hidden="true"
    >
      {cursors.map((cursor) => (
        <div
          key={cursor.id}
          className="absolute transition-all duration-150 ease-out"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: 'translate(-2px, -2px)',
          }}
        >
          {/* Cursor pointer */}
          <div
            dangerouslySetInnerHTML={{ __html: CURSOR_SVG(cursor.color) }}
            className="drop-shadow-sm"
          />

          {/* Name label */}
          <div
            className="absolute left-3.5 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.name}
          </div>
        </div>
      ))}
    </div>
  );
}
