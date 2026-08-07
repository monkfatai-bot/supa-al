"use client";

/**
 * Supa AI — Animated stats section.
 *
 * Four counters that animate from 0 to their target value on mount. The
 * animation uses a requestAnimationFrame loop with an ease-out curve,
 * stopping at the target value after ~1 second.
 *
 * @module @/components/marketing/sections/stats
 */
import * as React from "react";

import { MARKETING_STATS } from "../marketing-data";

interface CounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
}

/** Animated counter that ramps from 0 → value on mount. */
function Counter({ value, prefix = "", suffix = "", durationMs = 1000 }: CounterProps) {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

export function StatsSection() {
  return (
    <section
      className="bg-gradient-to-br from-emerald-600 to-emerald-800 py-16 text-white"
      aria-labelledby="stats-headline"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2
          id="stats-headline"
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Numbers that matter
        </h2>
        <dl className="mt-8 grid grid-cols-2 gap-8 sm:grid-cols-4">
          {MARKETING_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <dt className="text-4xl font-bold sm:text-5xl">
                <Counter
                  value={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                />
              </dt>
              <dd className="mt-2 text-sm text-emerald-50 sm:text-base">{stat.label}</dd>
              <p className="mt-1 text-xs text-emerald-100/80">{stat.description}</p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
