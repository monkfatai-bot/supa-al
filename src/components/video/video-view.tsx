"use client";

/**
 * Supa AI — Video view (Phase 5 top-level container).
 *
 * The dashboard section rendered for `'video'` by the `SectionRouter`.
 * Tabbed container with four surfaces:
 *
 *   - `generate` — the studio (prompt + model + options + submit).
 *   - `gallery`  — grid of past generations with filters.
 *   - `jobs`     — list of in-flight / historical background jobs.
 *   - `usage`    — current-month usage summary.
 *
 * @module @/components/video/video-view
 */
import * as React from "react";
import {
  BarChart3,
  Clapperboard,
  ListVideo,
  Wand2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  useVideoJobs,
  useVideoUsage,
} from "@/hooks/use-videos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

import { VideoStudio } from "./video-studio";
import { VideoGallery } from "./video-gallery";

type VideoTab = "generate" | "gallery" | "jobs" | "usage";

const TABS: { id: VideoTab; label: string; icon: typeof Wand2 }[] = [
  { id: "generate", label: "Generate", icon: Wand2 },
  { id: "gallery", label: "Gallery", icon: Clapperboard },
  { id: "jobs", label: "Jobs", icon: ListVideo },
  { id: "usage", label: "Usage", icon: BarChart3 },
];

export function VideoView() {
  const [tab, setTab] = React.useState<VideoTab>("generate");
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 scrollbar-thin">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === "generate" && (
          <div className="mx-auto max-w-3xl">
            <VideoStudio onGenerated={() => {
              setTab("gallery");
              setRefreshKey((k) => k + 1);
            }} />
          </div>
        )}
        {tab === "gallery" && (
          <VideoGallery key={refreshKey} />
        )}
        {tab === "jobs" && <JobsPanel />}
        {tab === "usage" && <UsagePanel />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jobs panel
// ---------------------------------------------------------------------------

function JobsPanel() {
  const query = useVideoJobs({ limit: 50 });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Background jobs</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={ListVideo}
            title="Couldn't load jobs"
            description={
              query.error instanceof Error
                ? query.error.message
                : "Please try again."
            }
          />
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState
            icon={ListVideo}
            title="No jobs yet"
            description="Generate a video to see its background job appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data ?? []).map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-[280px] truncate font-mono text-xs">
                      {job.id}
                    </TableCell>
                    <TableCell className="text-xs uppercase">
                      {job.provider}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.status}</Badge>
                    </TableCell>
                    <TableCell>{job.progress ?? 0}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(job.created_at), {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Usage panel
// ---------------------------------------------------------------------------

function UsagePanel() {
  const query = useVideoUsage();
  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Couldn't load usage"
        description={
          query.error instanceof Error
            ? query.error.message
            : "Please try again."
        }
      />
    );
  }
  const data = query.data;
  if (!data) return null;
  const providerEntries = Object.entries(data.byProvider ?? {});
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Videos generated" value={String(data.videosGenerated ?? 0)} />
        <Stat label="Credits used" value={String(data.creditsUsed ?? 0)} />
        <Stat
          label="Active providers"
          value={String(providerEntries.length)}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>By provider</CardTitle>
        </CardHeader>
        <CardContent>
          {providerEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No videos generated in the current period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Credits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerEntries.map(([provider, v]) => (
                    <TableRow key={provider}>
                      <TableCell className="uppercase">{provider}</TableCell>
                      <TableCell>{v.count}</TableCell>
                      <TableCell>{v.credits}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
