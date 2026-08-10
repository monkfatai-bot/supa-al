"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plug,
  Settings,
  Loader2,
  ChevronDown,
  X,
  ArrowUpRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  listIntegrations,
  connectIntegration,
} from "@/services/integration-hub/actions";
import {
  initiateOAuthFlow,
} from "@/services/integration-hub/actions";
import type {
  IntegrationWithAccount,
  ServiceResult,
} from "@/services/integration-hub/types";
import type { IntegrationCategory, OAuthProvider } from "@/types/generated/database";

// ── Constants ───────────────────────────────────────────────────

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI" },
  { value: "communication", label: "Communication" },
  { value: "storage", label: "Storage" },
  { value: "calendar", label: "Calendar" },
  { value: "payment", label: "Payments" },
  { value: "development", label: "Development" },
  { value: "commerce", label: "Commerce" },
] as const;

const PAGE_SIZE = 12;

function getCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    ai: "AI",
    communication: "Communication",
    storage: "Storage",
    calendar: "Calendar",
    payment: "Payments",
    development: "Development",
    commerce: "Commerce",
    other: "Other",
  };
  return map[cat] ?? cat;
}

function getCapabilityTags(capabilities: unknown): string[] {
  if (!capabilities) return [];
  if (Array.isArray(capabilities)) return capabilities.slice(0, 4);
  if (typeof capabilities === "object" && capabilities !== null) {
    const keys = Object.keys(capabilities);
    return keys.slice(0, 4);
  }
  return [];
}

// ── Props ────────────────────────────────────────────────────────

interface IntegrationDirectoryProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────

export function IntegrationDirectory({ workspaceId }: IntegrationDirectoryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const [allIntegrations, setAllIntegrations] = useState<IntegrationWithAccount[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Connect dialog state
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectingInteg, setConnectingInteg] = useState<IntegrationWithAccount | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [webhookUrlValue, setWebhookUrlValue] = useState("");
  const [connecting, setConnecting] = useState(false);

  const fetchIntegrations = useCallback(() => {
    setLoading(true);
    setError(null);

    const params: { workspaceId: string; category?: IntegrationCategory } = {
      workspaceId,
    };
    if (activeCategory !== "all") {
      params.category = activeCategory as IntegrationCategory;
    }

    listIntegrations(params)
      .then((res: ServiceResult<IntegrationWithAccount[]>) => {
        if (res.success && res.data) {
          setAllIntegrations(res.data);
        } else {
          setError(res.message ?? "Failed to load integrations");
        }
      })
      .finally(() => setLoading(false));
  }, [workspaceId, activeCategory]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Filter by search
  const filteredIntegrations = allIntegrations.filter((integ) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      integ.name.toLowerCase().includes(q) ||
      integ.description?.toLowerCase().includes(q) ||
      integ.provider?.toLowerCase().includes(q)
    );
  });

  const visibleIntegrations = filteredIntegrations.slice(0, visibleCount);
  const hasMore = visibleCount < filteredIntegrations.length;

  // ── Connect handlers ──────────────────────────────────────────

  const openConnectDialog = (integ: IntegrationWithAccount) => {
    setConnectingInteg(integ);
    setDisplayName("");
    setApiKeyValue("");
    setWebhookUrlValue("");
    setConnectDialogOpen(true);
  };

  const handleConnect = async () => {
    if (!connectingInteg) return;
    const authType = connectingInteg.auth_type;

    // For OAuth, redirect
    if (authType === "oauth" && connectingInteg.provider) {
      setConnecting(true);
      try {
        const res = await initiateOAuthFlow({
          workspaceId,
          integrationId: connectingInteg.id,
          provider: connectingInteg.provider as OAuthProvider,
        });
        if (res.success && res.data) {
          toast.success("Redirecting to authorize...");
          window.location.href = res.data.authorizationUrl;
        } else {
          toast.error(res.message ?? "Failed to initiate OAuth flow");
        }
      } catch {
        toast.error("An unexpected error occurred");
      } finally {
        setConnecting(false);
      }
      return;
    }

    // Validate required fields
    if (authType === "api_key" && !apiKeyValue.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    if (authType === "webhook" && !webhookUrlValue.trim()) {
      toast.error("Please enter a webhook URL");
      return;
    }

    setConnecting(true);
    try {
      const config: Record<string, string> = {};
      if (authType === "api_key") config.api_key = apiKeyValue;
      if (authType === "webhook") config.webhook_url = webhookUrlValue;

      const res = await connectIntegration({
        workspaceId,
        integrationId: connectingInteg.id,
        config,
        displayName: displayName.trim() || undefined,
      });

      if (res.success) {
        toast.success(`${connectingInteg.name} connected successfully`);
        setConnectDialogOpen(false);
        fetchIntegrations();
      } else {
        toast.error(res.message ?? "Failed to connect");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header with Search ─────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Integration Directory</h2>
          <p className="text-muted-foreground text-sm">
            Browse and connect integrations for your workspace
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="pl-9"
          />
          {searchQuery && (
            <button
              className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Category Tabs ──────────────────────────────────────── */}
      <Tabs
        value={activeCategory}
        onValueChange={(val) => {
          setActiveCategory(val);
          setVisibleCount(PAGE_SIZE);
        }}
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat.value} value={cat.value} className="text-xs sm:text-sm">
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ── Integration Grid ───────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                  <Skeleton className="h-8 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredIntegrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="text-muted-foreground mb-3 h-10 w-10" />
          <h3 className="text-lg font-medium">No integrations found</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Try adjusting your search or category filter
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleIntegrations.map((integ) => {
              const isConnected = !!integ.account;
              const capabilities = getCapabilityTags(integ.capabilities);
              return (
                <Card
                  key={integ.id}
                  className="group transition-all hover:shadow-md hover:border-foreground/20"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {integ.icon_url ? (
                          <img
                            src={integ.icon_url}
                            alt={integ.name}
                            className="h-5 w-5 rounded object-contain"
                          />
                        ) : (
                          <Plug className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm leading-tight">
                          {integ.name}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {integ.provider ?? integ.category}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className="shrink-0 text-[10px] px-1.5"
                      >
                        {getCategoryLabel(integ.category)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <p className="text-muted-foreground text-xs line-clamp-2">
                      {integ.description ?? "No description available"}
                    </p>
                    {capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {capabilities.map((cap) => (
                          <Badge
                            key={cap}
                            variant="secondary"
                            className="text-[10px] px-1.5"
                          >
                            {cap}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="pt-1">
                      {isConnected ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => toast.info(`${integ.name} is already configured`)}
                        >
                          <Settings className="mr-1.5 h-3 w-3" />
                          Configure
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => openConnectDialog(integ)}
                        >
                          <ArrowUpRight className="mr-1.5 h-3 w-3" />
                          Connect
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              >
                <ChevronDown className="mr-2 h-4 w-4" />
                Load More ({filteredIntegrations.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Connect Dialog ─────────────────────────────────────── */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect {connectingInteg?.name}</DialogTitle>
            <DialogDescription>
              {connectingInteg?.auth_type === "oauth"
                ? `You will be redirected to authorize with ${connectingInteg?.provider ?? "the provider"}.`
                : connectingInteg?.auth_type === "api_key"
                  ? "Enter your API key to connect this integration."
                  : connectingInteg?.auth_type === "webhook"
                    ? "Enter the webhook URL for this integration."
                    : "Configure the connection settings."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                placeholder={connectingInteg?.name ?? "My Integration"}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            {/* OAuth: just show authorize button in footer */}

            {/* API Key input */}
            {connectingInteg?.auth_type === "api_key" && (
              <div className="space-y-2">
                <Label htmlFor="api-key-input">API Key</Label>
                <Input
                  id="api-key-input"
                  type="password"
                  placeholder="sk_live_..."
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                />
              </div>
            )}

            {/* Webhook URL input */}
            {connectingInteg?.auth_type === "webhook" && (
              <div className="space-y-2">
                <Label htmlFor="webhook-url-input">Webhook URL</Label>
                <Input
                  id="webhook-url-input"
                  placeholder="https://your-app.com/webhook"
                  value={webhookUrlValue}
                  onChange={(e) => setWebhookUrlValue(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConnectDialogOpen(false)}
              disabled={connecting}
            >
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {connectingInteg?.auth_type === "oauth"
                ? `Authorize with ${connectingInteg?.provider ?? "Provider"}`
                : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
