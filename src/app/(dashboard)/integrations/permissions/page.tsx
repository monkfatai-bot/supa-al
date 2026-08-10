"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  listWorkspacePermissions,
  setWorkspaceIntegrationPermissions,
  enableIntegration,
  disableIntegration,
  listIntegrations,
} from "@/services/integration-hub";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Shield,
  Check,
  X,
  Power,
  Settings,
  AlertCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface PermissionPayload {
  accessMode: "read_only" | "full";
  scopes: string[];
  departmentIds: string[];
  userIds: string[];
  aiEmployeeAccess: boolean;
  workflowAccess: boolean;
}

interface PermissionRecord {
  id: string;
  workspace_id: string;
  integration_id: string;
  permissions: Record<string, unknown>;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  workspacePermissions: PermissionPayload;
}

interface IntegrationInfo {
  id: string;
  name: string;
  status: string;
  category: string;
}

const ALL_SCOPES = ["read", "write", "admin"];

// ─── Component ──────────────────────────────────────────────────

export default function PermissionsPage() {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRecord, setEditingRecord] = useState<PermissionRecord | null>(
    null
  );
  const [editForm, setEditForm] = useState<PermissionPayload | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    if (!workspace?.id) return;

    async function fetchData() {
      setIsLoading(true);
      try {
        const [permResult, intResult] = await Promise.all([
          listWorkspacePermissions(workspace!.id),
          listIntegrations({ workspaceId: workspace!.id }),
        ]);

        if (permResult.success && permResult.data) {
          setPermissions(permResult.data as unknown as PermissionRecord[]);
        }
        if (intResult.success && intResult.data) {
          setIntegrations(
            intResult.data.map((i) => ({
              id: i.id,
              name: i.name,
              status: i.status,
              category: i.category,
            }))
          );
        }
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [workspace?.id]);

  const getIntegrationName = useCallback(
    (integrationId: string) => {
      return (
        integrations.find((i) => i.id === integrationId)?.name ??
        integrationId.slice(0, 8) + "…"
      );
    },
    [integrations]
  );

  const getIntegrationStatus = useCallback(
    (integrationId: string) => {
      return (
        integrations.find((i) => i.id === integrationId)?.status ?? "unknown"
      );
    },
    [integrations]
  );

  const handleToggleIntegration = useCallback(
    async (integrationId: string, currentStatus: string) => {
      if (!workspace?.id) return;
      setTogglingId(integrationId);
      try {
        if (currentStatus === "active") {
          const result = await disableIntegration(workspace.id, integrationId);
          if (result.success) {
            toast.success("Integration disabled");
            setIntegrations((prev) =>
              prev.map((i) =>
                i.id === integrationId ? { ...i, status: "disabled" } : i
              )
            );
          } else {
            toast.error(result.message || "Failed to disable");
          }
        } else {
          const result = await enableIntegration(workspace.id, integrationId);
          if (result.success) {
            toast.success("Integration enabled");
            setIntegrations((prev) =>
              prev.map((i) =>
                i.id === integrationId ? { ...i, status: "active" } : i
              )
            );
          } else {
            toast.error(result.message || "Failed to enable");
          }
        }
      } catch {
        toast.error("Something went wrong");
      } finally {
        setTogglingId(null);
      }
    },
    [workspace?.id]
  );

  const handleEditPermissions = useCallback((record: PermissionRecord) => {
    setEditingRecord(record);
    setEditForm({ ...record.workspacePermissions });
  }, []);

  const handleScopeToggle = useCallback((scope: string) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const scopes = prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope];
      return { ...prev, scopes };
    });
  }, []);

  const handleSavePermissions = useCallback(async () => {
    if (!workspace?.id || !editingRecord || !editForm) return;
    setIsSaving(true);
    try {
      const result = await setWorkspaceIntegrationPermissions({
        workspaceId: workspace.id,
        integrationId: editingRecord.integration_id,
        ...editForm,
      });
      if (result.success) {
        toast.success("Permissions updated");
        setPermissions((prev) =>
          prev.map((p) =>
            p.id === editingRecord.id
              ? { ...p, workspacePermissions: { ...editForm } }
              : p
          )
        );
        setEditingRecord(null);
        setEditForm(null);
      } else {
        toast.error(result.message || "Failed to update permissions");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }, [workspace?.id, editingRecord, editForm]);

  // Stats
  const totalIntegrations = integrations.length;
  const activeCount = integrations.filter((i) => i.status === "active").length;
  const fullAccessCount = permissions.filter(
    (p) => !p.revoked_at && p.workspacePermissions.accessMode === "full"
  ).length;

  if (wsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Integration Permissions
        </h1>
        <p className="text-muted-foreground">
          Manage access modes, scopes, and permissions for workspace
          integrations.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Integrations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalIntegrations}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-emerald-600">
                {activeCount}
              </span>
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              >
                active
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Full Access</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{fullAccessCount}</span>
              <Badge variant="secondary">full</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Permissions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Integration Permissions
          </CardTitle>
          <CardDescription>
            Click a row to edit integration permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : permissions.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No integration permissions configured yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Integration Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Access Mode</TableHead>
                    <TableHead className="text-center">AI Employee</TableHead>
                    <TableHead className="text-center">Workflow</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.map((record) => {
                    const wp = record.workspacePermissions;
                    const status = getIntegrationStatus(
                      record.integration_id
                    );
                    const isActive = status === "active";
                    const isRevoked = !!record.revoked_at;

                    return (
                      <TableRow
                        key={record.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleEditPermissions(record)}
                      >
                        <TableCell className="font-medium">
                          {getIntegrationName(record.integration_id)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              isActive
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400"
                            }
                          >
                            {isRevoked ? "revoked" : isActive ? "active" : "inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              wp.accessMode === "full" ? "default" : "secondary"
                            }
                          >
                            {wp.accessMode === "full"
                              ? "Full Access"
                              : "Read Only"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {wp.aiEmployeeAccess ? (
                            <Check className="h-4 w-4 text-emerald-600 inline-block" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground inline-block" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {wp.workflowAccess ? (
                            <Check className="h-4 w-4 text-emerald-600 inline-block" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground inline-block" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleIntegration(
                                record.integration_id,
                                status
                              );
                            }}
                            disabled={
                              togglingId === record.integration_id ||
                              isRevoked
                            }
                          >
                            <Power
                              className={`h-4 w-4 ${
                                isActive
                                  ? "text-amber-500"
                                  : "text-emerald-500"
                              }`}
                            />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Permissions Dialog */}
      <Dialog
        open={!!editingRecord}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRecord(null);
            setEditForm(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Edit Permissions
            </DialogTitle>
          </DialogHeader>

          {editingRecord && editForm && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                {getIntegrationName(editingRecord.integration_id)}
              </p>

              <Separator />

              {/* Access Mode */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Access Mode</Label>
                <Select
                  value={editForm.accessMode}
                  onValueChange={(val) =>
                    setEditForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            accessMode: val as "read_only" | "full",
                          }
                        : prev
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read_only">Read Only</SelectItem>
                    <SelectItem value="full">Full Access</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Scopes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Scopes</Label>
                <div className="flex gap-4">
                  {ALL_SCOPES.map((scope) => (
                    <div key={scope} className="flex items-center gap-2">
                      <Checkbox
                        id={`scope-${scope}`}
                        checked={editForm.scopes.includes(scope)}
                        onCheckedChange={() => handleScopeToggle(scope)}
                      />
                      <Label
                        htmlFor={`scope-${scope}`}
                        className="text-sm capitalize cursor-pointer"
                      >
                        {scope}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Toggles */}
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">AI Employee Access</Label>
                <Switch
                  checked={editForm.aiEmployeeAccess}
                  onCheckedChange={(checked) =>
                    setEditForm((prev) =>
                      prev
                        ? { ...prev, aiEmployeeAccess: checked }
                        : prev
                    )
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Workflow Access</Label>
                <Switch
                  checked={editForm.workflowAccess}
                  onCheckedChange={(checked) =>
                    setEditForm((prev) =>
                      prev
                        ? { ...prev, workflowAccess: checked }
                        : prev
                    )
                  }
                />
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingRecord(null);
                    setEditForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSavePermissions} disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
