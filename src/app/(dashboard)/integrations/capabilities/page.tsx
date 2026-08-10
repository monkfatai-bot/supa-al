"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  listCapabilities,
  discoverCapabilitiesForWorkspace,
  findIntegrationsByCapability,
} from "@/services/integration-hub";
import type { ServiceResult } from "@/services/integration-hub";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  MessageSquare,
  HardDrive,
  CreditCard,
  Users,
  Calendar as CalendarIcon,
  GitBranch,
  Puzzle,
  Search,
  Layers,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface Capability {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  icon: string | null;
  created_at: string;
}

interface IntegrationWithCapability {
  integration_id: string;
}

const CATEGORY_OPTIONS = [
  { value: "All", label: "All" },
  { value: "AI", label: "AI" },
  { value: "Communication", label: "Communication" },
  { value: "Storage", label: "Storage" },
  { value: "Payment", label: "Payment" },
  { value: "CRM", label: "CRM" },
  { value: "Calendar", label: "Calendar" },
  { value: "Workflow", label: "Workflow" },
  { value: "General", label: "General" },
];

const ICON_MAP: Record<string, React.ElementType> = {
  AI: Brain,
  Communication: MessageSquare,
  Storage: HardDrive,
  Payment: CreditCard,
  CRM: Users,
  Calendar: CalendarIcon,
  Workflow: GitBranch,
  General: Puzzle,
};

const CATEGORY_COLORS: Record<string, string> = {
  AI: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Communication: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Storage: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Payment: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CRM: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  Calendar: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  Workflow: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  General: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

// ─── Component ──────────────────────────────────────────────────

export default function CapabilitiesPage() {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [workspaceCapabilities, setWorkspaceCapabilities] = useState<
    Capability[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCapability, setSelectedCapability] =
    useState<Capability | null>(null);
  const [supportingIntegrations, setSupportingIntegrations] = useState<
    IntegrationWithCapability[]
  >([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Fetch all capabilities
  useEffect(() => {
    async function fetchCapabilities() {
      setIsLoading(true);
      try {
        const result: ServiceResult<Capability[]> = await listCapabilities({
          search: undefined,
          category: undefined,
        });
        if (result.success && result.data) {
          setCapabilities(result.data);
        }
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    }
    fetchCapabilities();
  }, []);

  // Fetch workspace-specific capabilities for counts
  useEffect(() => {
    if (!workspace?.id) return;
    async function fetchWorkspaceCapabilities() {
      try {
        const result: ServiceResult<Capability[]> =
          await discoverCapabilitiesForWorkspace(workspace!.id);
        if (result.success && result.data) {
          setWorkspaceCapabilities(result.data);
        }
      } catch {
        // silent
      }
    }
    fetchWorkspaceCapabilities();
  }, [workspace?.id]);

  const getIntegrationCount = useCallback(
    (capId: string) => {
      return workspaceCapabilities.filter((c) => c.id === capId).length;
    },
    [workspaceCapabilities]
  );

  const handleCapabilityClick = useCallback(
    async (cap: Capability) => {
      setSelectedCapability(cap);
      if (!workspace?.id) return;
      setLoadingDetails(true);
      try {
        const result: ServiceResult<IntegrationWithCapability[]> =
          await findIntegrationsByCapability(cap.slug, workspace.id);
        if (result.success && result.data) {
          setSupportingIntegrations(result.data);
        } else {
          setSupportingIntegrations([]);
        }
      } catch {
        setSupportingIntegrations([]);
      } finally {
        setLoadingDetails(false);
      }
    },
    [workspace?.id]
  );

  const filteredCapabilities = capabilities.filter((cap) => {
    const matchesSearch =
      searchQuery === "" ||
      cap.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cap.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "All" || cap.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (wsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Integration Capabilities
        </h1>
        <p className="text-muted-foreground">
          Browse and discover capabilities available across your workspace
          integrations.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search capabilities…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Capabilities Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : filteredCapabilities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Layers className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No capabilities found</h3>
            <p className="text-muted-foreground text-sm text-center max-w-sm">
              {searchQuery || categoryFilter !== "All"
                ? "Try adjusting your search or filter to find capabilities."
                : "No capabilities have been registered yet. Install integrations to discover capabilities."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCapabilities.map((cap) => {
            const Icon = ICON_MAP[cap.category] || Puzzle;
            const count = getIntegrationCount(cap.id);
            return (
              <Card
                key={cap.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleCapabilityClick(cap)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-base">{cap.name}</CardTitle>
                    </div>
                    <Badge
                      variant="secondary"
                      className={CATEGORY_COLORS[cap.category] || ""}
                    >
                      {cap.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="line-clamp-2 mb-3">
                    {cap.description}
                  </CardDescription>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" />
                    <span>
                      {count} integration{count !== 1 ? "s" : ""} in workspace
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedCapability}
        onOpenChange={(open) => {
          if (!open) setSelectedCapability(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedCapability && (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {(() => {
                      const Icon =
                        ICON_MAP[selectedCapability.category] || Puzzle;
                      return <Icon className="h-4.5 w-4.5" />;
                    })()}
                  </div>
                  <div>
                    <span>{selectedCapability.name}</span>
                    <Badge
                      variant="secondary"
                      className={`ml-2 ${CATEGORY_COLORS[selectedCapability.category] || ""}`}
                    >
                      {selectedCapability.category}
                    </Badge>
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedCapability && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {selectedCapability.description}
              </p>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-3">
                  Supporting Integrations
                </h4>
                {loadingDetails ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : supportingIntegrations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No integrations in your workspace currently provide this
                    capability.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {supportingIntegrations.map((integ) => (
                      <div
                        key={integ.integration_id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <span className="text-sm font-medium">
                          {integ.integration_id.slice(0, 8)}…
                        </span>
                        <Badge variant="outline" className="text-xs">
                          active
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
