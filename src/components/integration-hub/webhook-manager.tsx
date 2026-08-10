"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Edit,
  Send,
  Trash2,
  Webhook,
  Eye,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  X,
  Link2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  createWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getWebhookEvents,
  retryWebhookEvent,
} from "@/services/integration-hub/actions";
import type {
  WebhookInfo,
  WebhookDeliveryResult,
} from "@/services/integration-hub/types";
import type { Json } from "@/types/generated/database";

// ── Types for webhook events (from webhook_events table) ──────

interface WebhookEventRow {
  id: string;
  webhook_id: string;
  workspace_id: string;
  event_type: string;
  payload: Json;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  attempt_count: number;
  status: string;
  next_retry_at: string | null;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────

const COMMON_EVENTS = [
  "invoice.created",
  "invoice.paid",
  "contract.approved",
  "contract.signed",
  "project.completed",
  "project.created",
  "employee.message",
  "employee.created",
  "payment.received",
  "payment.failed",
  "crm.lead.created",
  "crm.lead.converted",
];

function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getWebhookStatusBadge(status: string): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (status) {
    case "active":
      return { label: "Active", variant: "default" };
    case "inactive":
      return { label: "Inactive", variant: "secondary" };
    case "suspended":
      return { label: "Suspended", variant: "destructive" };
    default:
      return { label: status, variant: "secondary" };
  }
}

function getEventStatusBadge(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "success":
      return { label: "Success", className: "bg-emerald-100 text-emerald-700" };
    case "failed":
      return { label: "Failed", className: "bg-red-100 text-red-700" };
    case "retrying":
      return { label: "Retrying", className: "bg-amber-100 text-amber-700" };
    case "pending":
      return { label: "Pending", className: "bg-sky-100 text-sky-700" };
    case "dead":
      return { label: "Dead", className: "bg-gray-100 text-gray-600" };
    default:
      return { label: status, className: "bg-gray-100 text-gray-600" };
  }
}

function truncateUrl(url: string, maxLen: number = 40): string {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen) + "...";
}

// ── Header row input helper ─────────────────────────────────────

interface HeaderRow {
  key: string;
  value: string;
}

// ── Props ────────────────────────────────────────────────────────

interface WebhookManagerProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────

export function WebhookManager({ workspaceId }: WebhookManagerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookInfo[]>([]);

  // Create/Edit dialog
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookInfo | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSelectedEvents, setFormSelectedEvents] = useState<Set<string>>(
    new Set()
  );
  const [formCustomEvent, setFormCustomEvent] = useState("");
  const [formRetryCount, setFormRetryCount] = useState(3);
  const [formTimeout, setFormTimeout] = useState(5000);
  const [formHeaders, setFormHeaders] = useState<HeaderRow[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Events dialog
  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [eventsWebhookId, setEventsWebhookId] = useState<string | null>(null);
  const [eventsWebhookName, setEventsWebhookName] = useState("");
  const [events, setEvents] = useState<WebhookEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Test result
  const [testResult, setTestResult] = useState<WebhookDeliveryResult | null>(
    null
  );
  const [testing, setTesting] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<WebhookInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Retry loading
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  // Fetch webhooks
  const fetchWebhooks = useCallback(() => {
    setLoading(true);
    setError(null);
    listWebhooks(workspaceId)
      .then((res) => {
        if (res.success && res.data) {
          setWebhooks(res.data);
        } else {
          setError(res.message ?? "Failed to load webhooks");
        }
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  // ── Open create dialog ───────────────────────────────────────

  const openCreateDialog = () => {
    setEditingWebhook(null);
    setFormName("");
    setFormUrl("");
    setFormSelectedEvents(new Set());
    setFormCustomEvent("");
    setFormRetryCount(3);
    setFormTimeout(5000);
    setFormHeaders([]);
    setFormSubmitting(false);
    setFormDialogOpen(true);
  };

  // ── Open edit dialog ─────────────────────────────────────────

  const openEditDialog = (webhook: WebhookInfo) => {
    setEditingWebhook(webhook);
    setFormName(webhook.name);
    setFormUrl(webhook.url);
    setFormSelectedEvents(new Set(webhook.events));
    setFormCustomEvent("");
    setFormRetryCount(webhook.retryCount);
    setFormTimeout(webhook.timeoutMs);

    // Parse headers
    const hdrs = webhook.headers as Record<string, string> | null;
    setFormHeaders(
      hdrs ? Object.entries(hdrs).map(([k, v]) => ({ key: k, value: v })) : []
    );

    setFormSubmitting(false);
    setFormDialogOpen(true);
  };

  // ── Submit create / update ───────────────────────────────────

  const handleSubmitForm = async () => {
    if (!formName.trim()) {
      toast.error("Please enter a webhook name");
      return;
    }
    if (!formUrl.trim()) {
      toast.error("Please enter a webhook URL");
      return;
    }
    if (formSelectedEvents.size === 0) {
      toast.error("Please select at least one event");
      return;
    }

    const eventsArr = Array.from(formSelectedEvents);
    const headersObj = formHeaders.reduce(
      (acc, h) => {
        if (h.key.trim()) acc[h.key.trim()] = h.value;
        return acc;
      },
      {} as Record<string, string>
    );

    setFormSubmitting(true);

    try {
      if (editingWebhook) {
        // Update
        const res = await updateWebhook(workspaceId, editingWebhook.id, {
          name: formName.trim(),
          url: formUrl.trim(),
          events: eventsArr,
          retryCount: formRetryCount,
          timeoutMs: formTimeout,
          headers: headersObj,
        });

        if (res.success) {
          toast.success("Webhook updated successfully");
          setFormDialogOpen(false);
          fetchWebhooks();
        } else {
          toast.error(res.message ?? "Failed to update webhook");
        }
      } else {
        // Create
        const res = await createWebhook({
          workspaceId,
          name: formName.trim(),
          url: formUrl.trim(),
          events: eventsArr,
          retryCount: formRetryCount,
          timeoutMs: formTimeout,
          headers: headersObj,
        });

        if (res.success) {
          toast.success("Webhook created successfully");
          setFormDialogOpen(false);
          fetchWebhooks();
        } else {
          toast.error(res.message ?? "Failed to create webhook");
        }
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setFormSubmitting(false);
    }
  };

  // ── Test webhook ─────────────────────────────────────────────

  const handleTest = async (webhookId: string) => {
    setTesting(webhookId);
    setTestResult(null);
    try {
      const res = await testWebhook(workspaceId, webhookId);
      if (res.success && res.data) {
        setTestResult(res.data);
        if (res.data.success) {
          toast.success(
            `Test ping succeeded (${res.data.responseStatus}, ${res.data.durationMs}ms)`
          );
        } else {
          toast.error(
            `Test ping failed: ${res.data.errorMessage ?? `HTTP ${res.data.responseStatus}`}`
          );
        }
      } else {
        toast.error(res.message ?? "Failed to test webhook");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setTesting(null);
    }
  };

  // ── Delete webhook ───────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteWebhook(workspaceId, deleteTarget.id);
      if (res.success) {
        toast.success(`Webhook "${deleteTarget.name}" deleted`);
        setDeleteTarget(null);
        fetchWebhooks();
      } else {
        toast.error(res.message ?? "Failed to delete webhook");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setDeleting(false);
    }
  };

  // ── View events ───────────────────────────────────────────────

  const handleViewEvents = async (webhook: WebhookInfo) => {
    setEventsWebhookId(webhook.id);
    setEventsWebhookName(webhook.name);
    setEventsDialogOpen(true);
    setEventsLoading(true);
    setEvents([]);

    try {
      const res = await getWebhookEvents(workspaceId, webhook.id, undefined, 50, 0);
      if (res.success && res.data) {
        setEvents(res.data as unknown as WebhookEventRow[]);
      } else {
        toast.error(res.message ?? "Failed to load webhook events");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setEventsLoading(false);
    }
  };

  // ── Retry event ───────────────────────────────────────────────

  const handleRetryEvent = async (eventId: string) => {
    setRetrying((prev) => new Set(prev).add(eventId));
    try {
      const res = await retryWebhookEvent(workspaceId, eventId);
      if (res.success && res.data) {
        toast.success(
          res.data.success
            ? `Retry succeeded (${res.data.responseStatus})`
            : `Retry returned HTTP ${res.data.responseStatus}`
        );
      } else {
        toast.error(res.message ?? "Failed to retry event");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  // ── Toggle event selection ───────────────────────────────────

  const toggleEvent = (event: string) => {
    setFormSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  };

  const addCustomEvent = () => {
    const ev = formCustomEvent.trim();
    if (!ev) return;
    if (formSelectedEvents.has(ev)) {
      toast.error("Event already selected");
      return;
    }
    setFormSelectedEvents((prev) => new Set(prev).add(ev));
    setFormCustomEvent("");
  };

  // ── Header row management ────────────────────────────────────

  const addHeaderRow = () => {
    setFormHeaders((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeHeaderRow = (index: number) => {
    setFormHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const updateHeaderRow = (
    index: number,
    field: "key" | "value",
    val: string
  ) => {
    setFormHeaders((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: val } : h))
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Webhooks</h2>
          <p className="text-muted-foreground text-sm">
            Manage webhook endpoints for real-time event notifications
          </p>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create Webhook
        </Button>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Test Result Banner ──────────────────────────────────── */}
      {testResult && (
        <Alert
          variant={testResult.success ? "default" : "destructive"}
          className={
            testResult.success ? "border-emerald-200 bg-emerald-50" : ""
          }
        >
          <AlertDescription className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <span>
              Test ping{" "}
              {testResult.success ? "succeeded" : "failed"}
              {testResult.responseStatus > 0 &&
                ` — HTTP ${testResult.responseStatus}`}
              {testResult.durationMs > 0 &&
                ` — ${testResult.durationMs}ms`}
            </span>
            {testResult.errorMessage && (
              <span className="ml-2 text-xs">({testResult.errorMessage})</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Webhook Cards ──────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-24" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Webhook className="text-muted-foreground mb-2 h-10 w-10" />
          <h3 className="text-lg font-medium">No webhooks configured</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Create a webhook to receive real-time event notifications
          </p>
          <Button className="mt-4" size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Webhook
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {webhooks.map((wh) => {
            const statusBadge = getWebhookStatusBadge(wh.status);
            return (
              <Card
                key={wh.id}
                className="transition-all hover:shadow-md hover:border-foreground/20"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm leading-tight">
                      {wh.name}
                    </CardTitle>
                    <Badge
                      variant={statusBadge.variant}
                      className="shrink-0 text-[10px]"
                    >
                      {statusBadge.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {/* URL */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {truncateUrl(wh.url, 45)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-md">
                      <p className="break-all text-xs">{wh.url}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Events */}
                  <div className="flex flex-wrap gap-1">
                    {wh.events.slice(0, 3).map((ev) => (
                      <Badge
                        key={ev}
                        variant="outline"
                        className="text-[10px] px-1.5"
                      >
                        {ev}
                      </Badge>
                    ))}
                    {wh.events.length > 3 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        +{wh.events.length - 3} more
                      </Badge>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      {wh.successCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-red-500" />
                      {wh.failureCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeDate(wh.lastTriggeredAt)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={() => openEditDialog(wh)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={testing === wh.id}
                      onClick={() => handleTest(wh.id)}
                    >
                      {testing === wh.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleViewEvents(wh)}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(wh)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ───────────────────────────────── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingWebhook ? "Edit Webhook" : "Create Webhook"}
            </DialogTitle>
            <DialogDescription>
              {editingWebhook
                ? "Update webhook configuration"
                : "Configure a new webhook endpoint"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4 py-2">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="wh-name">Name</Label>
                <Input
                  id="wh-name"
                  placeholder="e.g., Production Webhook"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              {/* URL */}
              <div className="space-y-2">
                <Label htmlFor="wh-url">Endpoint URL</Label>
                <Input
                  id="wh-url"
                  placeholder="https://your-app.com/api/webhook"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                />
              </div>

              {/* Events multi-select */}
              <div className="space-y-2">
                <Label>Events</Label>
                <div className="max-h-48 overflow-y-auto rounded-lg border p-3 space-y-2">
                  {COMMON_EVENTS.map((event) => (
                    <div key={event} className="flex items-center gap-2">
                      <Checkbox
                        id={`event-${event}`}
                        checked={formSelectedEvents.has(event)}
                        onCheckedChange={() => toggleEvent(event)}
                      />
                      <Label
                        htmlFor={`event-${event}`}
                        className="text-xs font-normal cursor-pointer"
                      >
                        {event}
                      </Label>
                    </div>
                  ))}

                  {/* Custom event */}
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="custom.event.name"
                      className="h-8 text-xs"
                      value={formCustomEvent}
                      onChange={(e) => setFormCustomEvent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomEvent();
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 text-xs"
                      onClick={addCustomEvent}
                      disabled={!formCustomEvent.trim()}
                    >
                      Add
                    </Button>
                  </div>

                  {/* Show currently selected custom events */}
                  {Array.from(formSelectedEvents)
                    .filter((e) => !COMMON_EVENTS.includes(e))
                    .map((customEv) => (
                      <div
                        key={customEv}
                        className="flex items-center justify-between rounded bg-muted px-2 py-1"
                      >
                        <span className="text-xs">{customEv}</span>
                        <button
                          onClick={() => toggleEvent(customEv)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>

              {/* Retry count */}
              <div className="space-y-2">
                <Label htmlFor="wh-retry">Retry Count</Label>
                <Input
                  id="wh-retry"
                  type="number"
                  min={0}
                  max={10}
                  value={formRetryCount}
                  onChange={(e) =>
                    setFormRetryCount(parseInt(e.target.value, 10) || 0)
                  }
                />
              </div>

              {/* Timeout */}
              <div className="space-y-2">
                <Label htmlFor="wh-timeout">Timeout (ms)</Label>
                <Input
                  id="wh-timeout"
                  type="number"
                  min={1000}
                  max={30000}
                  step={1000}
                  value={formTimeout}
                  onChange={(e) =>
                    setFormTimeout(parseInt(e.target.value, 10) || 5000)
                  }
                />
              </div>

              {/* Custom Headers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Custom Headers</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addHeaderRow}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Header
                  </Button>
                </div>
                {formHeaders.length > 0 ? (
                  <div className="space-y-2">
                    {formHeaders.map((hdr, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          placeholder="Key"
                          className="h-8 text-xs"
                          value={hdr.key}
                          onChange={(e) =>
                            updateHeaderRow(idx, "key", e.target.value)
                          }
                        />
                        <Input
                          placeholder="Value"
                          className="h-8 text-xs"
                          value={hdr.value}
                          onChange={(e) =>
                            updateHeaderRow(idx, "value", e.target.value)
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 shrink-0"
                          onClick={() => removeHeaderRow(idx)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No custom headers configured
                  </p>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormDialogOpen(false)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitForm} disabled={formSubmitting}>
              {formSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingWebhook ? "Save Changes" : "Create Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Events Dialog ──────────────────────────────────── */}
      <Dialog open={eventsDialogOpen} onOpenChange={setEventsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Events: {eventsWebhookName}
            </DialogTitle>
            <DialogDescription>
              Recent webhook delivery events
            </DialogDescription>
          </DialogHeader>

          {eventsLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : events.length > 0 ? (
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-2">
                {events.map((ev) => {
                  const statusInfo = getEventStatusBadge(ev.status);
                  return (
                    <div
                      key={ev.id}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.className}`}
                          >
                            {statusInfo.label}
                          </span>
                          <span className="text-sm font-medium truncate">
                            {ev.event_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {ev.response_status !== null && (
                            <Badge variant="outline" className="text-[10px]">
                              HTTP {ev.response_status}
                            </Badge>
                          )}
                          <span className="text-muted-foreground text-xs">
                            {formatDate(ev.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Error message */}
                      {ev.error_message && (
                        <p className="text-red-500 text-xs flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {ev.error_message}
                        </p>
                      )}

                      {/* Response body (truncated) */}
                      {ev.response_body && (
                        <p className="text-muted-foreground text-xs truncate">
                          {ev.response_body.length > 120
                            ? ev.response_body.substring(0, 120) + "..."
                            : ev.response_body}
                        </p>
                      )}

                      {/* Attempt count + retry button */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">
                          Attempt {ev.attempt_count} of{" "}
                          {eventsWebhookId
                            ? (webhooks.find((w) => w.id === eventsWebhookId)
                                ?.retryCount ?? 3)
                            : 3}
                        </span>
                        {(ev.status === "failed" || ev.status === "dead") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px]"
                            disabled={retrying.has(ev.id)}
                            onClick={() => handleRetryEvent(ev.id)}
                          >
                            {retrying.has(ev.id) ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3 w-3" />
                            )}
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Webhook className="text-muted-foreground mb-2 h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                No events recorded for this webhook yet
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEventsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the webhook{" "}
              <strong>"{deleteTarget?.name}"</strong>? This will stop all event
              deliveries to {deleteTarget?.url ?? "this endpoint"}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
