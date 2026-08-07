"use client";

/**
 * Supa AI — Phase 10 Integration Hub — webhook config.
 *
 * Lists the workspace's webhook subscriptions + recent deliveries. Each
 * subscription shows its URL slug + signing secret (masked) + delivery
 * stats + a copy-to-clipboard button for the inbound URL.
 *
 * @module @/components/integrations/webhook-config
 */
import * as React from "react";
import { Webhook, Copy, Trash2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  useCreateWebhookSubscription,
  useDeleteWebhookSubscription,
  useWebhookDeliveries,
  useWebhookSubscriptions,
} from "@/hooks/use-integrations";
import { useToast } from "@/hooks/use-toast";

interface WebhookConfigProps {
  workspaceId: string;
}

export function WebhookConfig({ workspaceId }: WebhookConfigProps) {
  const { toast } = useToast();
  const subsQuery = useWebhookSubscriptions(workspaceId);
  const deliveriesQuery = useWebhookDeliveries({ workspaceId });
  const createMutation = useCreateWebhookSubscription();
  const deleteMutation = useDeleteWebhookSubscription();
  const [targetUrl, setTargetUrl] = React.useState("");

  const handleCreate = React.useCallback(() => {
    createMutation.mutate(
      {
        workspace_id: workspaceId,
        target_url: targetUrl || undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Webhook created" });
          setTargetUrl("");
        },
        onError: (err: Error) => {
          toast({
            title: "Create failed",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  }, [createMutation, workspaceId, targetUrl, toast]);

  const handleCopy = React.useCallback(
    (slug: string) => {
      const url = `${window.location.origin}/api/v1/integrations/webhooks/${slug}`;
      void navigator.clipboard.writeText(url);
      toast({ title: "Copied", description: url });
    },
    [toast],
  );

  const handleDelete = React.useCallback(
    (id: string) => {
      deleteMutation.mutate(
        { workspaceId, subscriptionId: id },
        {
          onSuccess: () => {
            toast({ title: "Webhook deleted" });
          },
        },
      );
    },
    [deleteMutation, workspaceId, toast],
  );

  if (subsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (subsQuery.isError) {
    return (
      <EmptyState
        icon={Webhook}
        title="Couldn't load webhooks"
        description="Please try again later."
      />
    );
  }

  const subs = subsQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          type="url"
          placeholder="Target URL (optional)"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          className="min-w-[260px] flex-1"
        />
        <Button onClick={handleCreate} disabled={createMutation.isPending}>
          <Plus className="size-4" aria-hidden="true" />
          New webhook
        </Button>
      </div>

      {subs.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No webhooks yet"
          description="Create a webhook subscription to receive inbound events from third-party services."
        />
      ) : (
        <ul className="space-y-2">
          {subs.map((sub) => (
            <li
              key={sub.id}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-medium">
                  /{sub.url_slug}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {sub.target_url ?? "no target url"} ·{" "}
                  {sub.total_received} received · {sub.total_failed} failed
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={sub.is_active ? "default" : "secondary"}>
                  {sub.is_active ? "active" : "inactive"}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy(sub.url_slug)}
                >
                  <Copy className="size-4" aria-hidden="true" />
                  URL
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(sub.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Recent deliveries */}
      <div>
        <p className="mb-2 text-sm font-medium">Recent deliveries</p>
        {deliveries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No deliveries yet — inbound webhooks will appear here.
          </p>
        ) : (
          <ul className="divide-y rounded-md border text-xs">
            {deliveries.map((d) => (
              <li key={d.id} className="flex items-center gap-3 p-2">
                <Badge
                  variant={
                    d.status === "delivered"
                      ? "default"
                      : d.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {d.status}
                </Badge>
                <span className="truncate font-mono">{d.event_type}</span>
                <span className="ml-auto text-muted-foreground">
                  {new Date(d.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
