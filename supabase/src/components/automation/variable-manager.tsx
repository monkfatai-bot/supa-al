"use client";

/**
 * Supa AI — Phase 9A Automation — variable manager.
 *
 * Lets the user add / edit / delete a workflow's `workflow_variables`.
 * Each row shows the variable's `key`, `type`, and (for non-secret
 * variables) the current value. Secret variables display `[secret]`
 * instead of the value.
 *
 * @module @/components/automation/variable-manager
 */
import * as React from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  WorkflowVariable,
  WorkflowVariableType,
} from "@/lib/automation/client";
import {
  useCreateVariable,
  useVariables,
} from "@/hooks/use-automation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export interface VariableManagerProps {
  workflowId: string;
  className?: string;
}

const VARIABLE_TYPES: WorkflowVariableType[] = [
  "string",
  "number",
  "boolean",
  "json",
  "secret",
];

export function VariableManager({ workflowId, className }: VariableManagerProps) {
  const variablesQuery = useVariables(workflowId);
  const createMutation = useCreateVariable();
  const { toast } = useToast();

  const [newKey, setNewKey] = React.useState("");
  const [newValue, setNewValue] = React.useState("");
  const [newType, setNewType] = React.useState<WorkflowVariableType>("string");
  const [newSecret, setNewSecret] = React.useState(false);

  const handleCreate = React.useCallback(async () => {
    if (!newKey.trim()) return;
    try {
      await createMutation.mutateAsync({
        workflowId,
        input: {
          key: newKey.trim(),
          value: newValue || null,
          type: newType,
          isSecret: newSecret || newType === "secret",
        },
      });
      setNewKey("");
      setNewValue("");
      setNewType("string");
      setNewSecret(false);
      toast({ title: "Variable added" });
    } catch (err) {
      toast({
        title: "Failed to add variable",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [createMutation, workflowId, newKey, newValue, newType, newSecret, toast]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-sm font-medium">Add a variable</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_120px_auto_auto]">
          <Input
            placeholder="key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <Input
            placeholder="value (optional)"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            disabled={newSecret || newType === "secret"}
          />
          <Select
            value={newType}
            onValueChange={(v) => setNewType(v as WorkflowVariableType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIABLE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={newSecret || newType === "secret"}
              onCheckedChange={setNewSecret}
              disabled={newType === "secret"}
            />
            Secret
          </label>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!newKey.trim() || createMutation.isPending}
            className="gap-1.5"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>

      {variablesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : variablesQuery.data && variablesQuery.data.length > 0 ? (
        <ul className="space-y-1.5">
          {variablesQuery.data.map((v) => (
            <li key={v.id}>
              <VariableRow variable={v} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={KeyRound}
          title="No variables"
          description="Variables let your workflow reference dynamic values (e.g. {{contact.email}}) in action configs."
        />
      )}
    </div>
  );
}

function VariableRow({ variable }: { variable: WorkflowVariable }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{variable.key}</p>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {variable.type}
          </span>
          {variable.is_secret ? (
            <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
              secret
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground truncate font-mono">
          {variable.is_secret ? "[secret]" : (variable.value ?? "—")}
        </p>
      </div>
      <Trash2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
