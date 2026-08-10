"use client";

import { useEffect, useRef } from "react";

/**
 * Client component that periodically pings the /api/automation/tick endpoint
 * to process scheduled jobs.  Only active when `enabled` is true.
 */
export function SchedulerTick({ enabled }: { enabled: boolean }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const TICK_INTERVAL_MS = 60_000;

    const tick = () => {
      fetch("/api/automation/tick", { method: "POST" }).catch(() => {
        /* best-effort — don't surface network errors to the user */
      });
    };

    // Fire once immediately, then every TICK_INTERVAL_MS
    tick();
    intervalRef.current = setInterval(tick, TICK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);

  // This component renders nothing visible
  return null;
}
