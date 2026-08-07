"use client";

/**
 * Supa AI — Phase 9B Builder — config panel.
 *
 * Right sidebar for editing the selected node's configuration. Renders
 * a form driven by the node definition's `configSchema` — each field
 * type maps to a shadcn input control. Changes call `onConfigChange`
 * with the new config object so the parent can persist them.
 *
 * When no node is selected, the panel renders a hint to pick one.
 *
 * @module @/components/builder/config-panel
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { nodeRegistry } from "@/lib/builder/node-definitions";
import type { NodeConfigField, WorkflowNode } from "@/lib/builder/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface ConfigPanelProps {
  /** The currently selected node (or null). */
  node: WorkflowNode | null;
  /** The catalog type override (used when the node was created from the palette). */
  catalogType?: string;
  onConfigChange: (config: Record<string, unknown>) => void;
  onLabelChange: (label: string) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onDelete: () => void;
  className?: string;
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: NodeConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          id={field.key}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      );
    case "number":
      return (
        <Input
          id={field.key}
          type="number"
          value={typeof value === "number" ? value : (value as string) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={field.key}
            checked={typeof value === "boolean" ? value : false}
            onCheckedChange={onChange}
          />
          <Label htmlFor={field.key} className="text-xs text-muted-foreground">
            {value ? "Enabled" : "Disabled"}
          </Label>
        </div>
      );
    case "select":
      return (
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger id={field.key}>
            <SelectValue placeholder={field.placeholder ?? "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "json":
      return (
        <Textarea
          id={field.key}
          value={
            typeof value === "string"
              ? value
              : (() => {
                  try {
                    return JSON.stringify(value, null, 2);
                  } catch {
                    return "";
                  }
                })()
          }
          placeholder={field.placeholder ?? "{}"}
          onChange={(e) => {
            // Try parsing the JSON; if it fails, keep the raw text so the
            // user can finish typing. The parent persists the raw string
            // and the validator will catch malformed JSON on save.
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              onChange(e.target.value);
            }
          }}
          rows={6}
          className="font-mono text-xs"
        />
      );
    case "url":
      return (
        <Input
          id={field.key}
          type="url"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder ?? "https://"}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "email":
      return (
        <Input
          id={field.key}
          type="email"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "text":
    default:
      return (
        <Input
          id={field.key}
          type="text"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function ConfigPanel({
  node,
  catalogType,
  onConfigChange,
  onLabelChange,
  onToggleEnabled,
  onDelete,
  className,
}: ConfigPanelProps) {
  const def = React.useMemo(() => {
    if (!node) return null;
    // Try catalogType override first; fall back to __type__ in config; then label.
    const typeFromConfig =
      typeof node.config === "object" && node.config !== null
        ? ((node.config as Record<string, unknown>).__type__ as string | undefined)
        : undefined;
    if (catalogType) {
      const found = nodeRegistry.find(catalogType);
      if (found) return found;
    }
    if (typeFromConfig) {
      const found = nodeRegistry.find(typeFromConfig);
      if (found) return found;
    }
    const byLabel = nodeRegistry.list().find((n) => n.label === node.label);
    return byLabel ?? null;
  }, [node, catalogType]);

  if (!node) {
    return (
      <aside
        className={cn(
          "flex w-full flex-col gap-2 border-l bg-background/40 p-4 sm:w-80",
          className,
        )}
        aria-label="Node config"
      >
        <h2 className="text-sm font-semibold">Configure</h2>
        <p className="text-xs text-muted-foreground">
          Select a node on the canvas to configure it.
        </p>
      </aside>
    );
  }

  const config = (node.config ?? {}) as Record<string, unknown>;
  const fields = def?.configSchema ?? [];

  return (
    <aside
      className={cn(
        "flex w-full flex-col border-l bg-background/40 sm:w-80",
        className,
      )}
      aria-label="Node config"
    >
      <header className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Configure</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            Delete node
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {def?.description ?? "No description available."}
        </p>
      </header>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="node-label" className="text-xs">Label</Label>
            <Input
              id="node-label"
              value={node.label}
              onChange={(e) => onLabelChange(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="node-key" className="text-xs">Node Key</Label>
            <Input id="node-key" value={node.node_key} disabled />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="node-enabled"
              checked={node.is_enabled}
              onCheckedChange={(v) => onToggleEnabled(v === true)}
            />
            <Label htmlFor="node-enabled" className="text-xs">
              Enabled (run at execution time)
            </Label>
          </div>
          <Separator />
          {fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This node has no configurable fields.
            </p>
          ) : (
            fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={field.key} className="text-xs">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                <FieldRenderer
                  field={field}
                  value={config[field.key] ?? field.defaultValue}
                  onChange={(v) => onConfigChange({ ...config, [field.key]: v })}
                />
                {field.help && (
                  <p className="text-[10px] text-muted-foreground">{field.help}</p>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
