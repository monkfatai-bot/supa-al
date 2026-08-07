"use client";

/**
 * Supa AI — Voice usage card (Phase 8).
 *
 * Reads the workspace's voice usage summary from `/api/voice/usage` and
 * renders four stat tiles (total generations, total credits used, by-type
 * breakdown, by-provider breakdown) for the current calendar month.
 *
 * @module @/components/voice/voice-usage-card
 */
import * as React from "react";
import {
  Activity,
  BarChart3,
  DollarSign,
  Mic,
} from "lucide-react";

import type { VoiceUsageSummary } from "@/lib/voice/client";
import { useVoiceUsage } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function VoiceUsageCard() {
  const usage = useVoiceUsage();
  const summary = usage.data as VoiceUsageSummary | undefined;

  if (usage.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (usage.isError || !summary) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Couldn't load voice usage"
        description={
          usage.error instanceof Error
            ? usage.error.message
            : "Please try again."
        }
        action={
          <Button size="sm" variant="secondary" onClick={() => usage.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const byType = summary.byType;
  const byProvider = summary.byProvider;
  const providers = Object.entries(byProvider).sort(
    (a, b) => b[1].generations - a[1].generations,
  );
  const maxProviderCount = providers.length > 0 ? providers[0]![1].generations : 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Generations"
          value={summary.totalGenerations.toLocaleString()}
          icon={Mic}
        />
        <StatTile
          label="Credits used"
          value={summary.totalCreditsUsed.toLocaleString()}
          icon={DollarSign}
        />
        <StatTile
          label="TTS calls"
          value={byType.tts.toLocaleString()}
          icon={Activity}
        />
        <StatTile
          label="STT calls"
          value={byType.stt.toLocaleString()}
          icon={BarChart3}
        />
      </div>

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">By provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          {providers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No provider activity yet this month.
            </p>
          ) : (
            providers.map(([provider, stats]) => (
              <div key={provider} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="uppercase text-muted-foreground">{provider}</span>
                  <span className="font-medium">
                    {stats.generations.toLocaleString()} gens · {stats.creditsUsed.toLocaleString()} credits
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(stats.generations / maxProviderCount) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">By operation type</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
          {(["tts", "stt", "translate", "dub", "clone"] as const).map((t) => (
            <div key={t} className="space-y-1 rounded-md border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t}</p>
              <p className="text-lg font-semibold">{byType[t].toLocaleString()}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Mic;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="py-3">
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
