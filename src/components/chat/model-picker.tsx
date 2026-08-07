"use client";

/**
 * Supa AI — Model picker (Phase 3 chat).
 *
 * A popover that lets the user pick which provider + model the next
 * outbound message will use. Fetches the model catalog from
 * `/api/chat/models` (which returns only providers with an API key
 * configured) and groups the models by provider in collapsible
 * sections.
 *
 * Each model row shows:
 *   - Label + tier badge (free / starter / pro / business / enterprise).
 *   - One-line description.
 *   - Combined input + output cost per 1K tokens.
 *   - A check icon on the currently-selected model.
 *
 * When no providers are configured (the API returns an empty
 * `groups` array), the picker renders an honest empty state with a
 * hint to visit Settings → AI Providers.
 *
 * Selection is persisted into the {@link useChatStore} Zustand store
 * so it survives a refresh.
 *
 * @module @/components/chat/model-picker
 */
import * as React from "react";
import {
  Check,
  ChevronDown,
  Cpu,
  Sparkles,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AIProvider } from "@/lib/ai/types";
import { useChatStore } from "@/stores/chat-store";
import { useModels, type ModelsResponse } from "@/hooks/use-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

/** Tier badge color mapping (kept neutral — no indigo/blue). */
const TIER_BADGE_CLASS: Record<string, string> = {
  free: "border-emerald/30 bg-emerald/10 text-emerald-700 dark:text-emerald-300",
  starter:
    "border-teal/30 bg-teal/10 text-teal-700 dark:text-teal-300",
  pro: "border-amber/30 bg-amber/10 text-amber-700 dark:text-amber-300",
  business:
    "border-orange/30 bg-orange/10 text-orange-700 dark:text-orange-300",
  enterprise:
    "border-rose/30 bg-rose/10 text-rose-700 dark:text-rose-300",
};

/** Format a cost-per-1K-tokens (in USD cents) as a USD string. */
function formatCostPer1K(cents: number): string {
  if (!cents) return "—";
  const usd = cents / 100;
  if (usd < 0.01) return `$${usd.toFixed(4)}/1K`;
  return `$${usd.toFixed(3)}/1K`;
}

/** Compute the combined input + output cost per 1K tokens. */
function combinedCost(model: {
  inputCostCentsPer1K: number;
  outputCostCentsPer1K: number;
}): string {
  const sum = model.inputCostCentsPer1K + model.outputCostCentsPer1K;
  return formatCostPer1K(sum);
}

/** Find the label for the currently-selected model. */
function findSelectedLabel(
  data: ModelsResponse | undefined,
  provider: AIProvider | null,
  modelId: string | null,
): string | null {
  if (!data || !provider || !modelId) return null;
  for (const group of data.groups) {
    if (group.provider !== provider) continue;
    for (const m of group.models) {
      if (m.id === modelId) return m.label;
    }
  }
  return null;
}

/** A single model row inside a provider group. */
function ModelRow({
  model,
  isSelected,
  onSelect,
}: {
  model: ModelsResponse["groups"][number]["models"][number];
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors",
        "hover:border-border hover:bg-accent/50",
        isSelected && "border-brand/40 bg-brand/5",
      )}
      aria-pressed={isSelected}
    >
      <div className="mt-0.5 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {model.label}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "h-4 px-1.5 text-[10px] capitalize",
              TIER_BADGE_CLASS[model.tier] ??
                "border-border bg-muted text-muted-foreground",
            )}
          >
            {model.tier}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{model.description}</p>
        <div className="flex items-center gap-3 pt-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Wallet className="size-3" aria-hidden="true" />
            {combinedCost(model)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Cpu className="size-3" aria-hidden="true" />
            {(model.contextWindow / 1000).toLocaleString()}K ctx
          </span>
        </div>
      </div>
      {isSelected && (
        <Check
          className="mt-1 size-4 shrink-0 text-brand"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/** A collapsible provider section. */
function ProviderGroup({
  group,
  selectedModel,
  onSelect,
}: {
  group: ModelsResponse["groups"][number];
  selectedModel: string | null;
  onSelect: (provider: AIProvider, modelId: string) => void;
}) {
  const hasSelected = group.models.some(
    (m) => m.id === selectedModel,
  );
  // Open by default when this group contains the selected model.
  const [open, setOpen] = React.useState(hasSelected);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between px-2 py-1.5 text-left"
          aria-expanded={open}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 pb-2">
          {group.models.map((m) => (
            <ModelRow
              key={`${group.provider}:${m.id}`}
              model={m}
              isSelected={m.id === selectedModel}
              onSelect={() => onSelect(group.provider, m.id)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Empty state shown when no providers are configured. */
function NoProvidersState() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">No AI providers configured</p>
      <p className="mx-auto max-w-xs text-xs text-muted-foreground">
        Add an API key for OpenAI, Anthropic, Google, or another supported
        provider in Settings → AI Providers to start chatting.
      </p>
    </div>
  );
}

/** Props accepted by {@link ModelPicker}. */
export interface ModelPickerProps {
  /** Compact mode (used in the composer footer) vs full mode. */
  compact?: boolean;
  /** Disable the trigger (e.g. while a stream is in flight). */
  disabled?: boolean;
}

/** The picker itself — a popover trigger + scrollable content. */
export function ModelPicker({ compact, disabled }: ModelPickerProps) {
  const query = useModels();
  const selectedProvider = useChatStore((s) => s.selectedProvider);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setModel = useChatStore((s) => s.setModel);
  const [open, setOpen] = React.useState(false);

  // Initialize the selection from the API defaults once.
  React.useEffect(() => {
    if (!query.data) return;
    if (selectedProvider && selectedModel) return;
    setModel(query.data.defaultProvider, query.data.defaultModel);
  }, [query.data, selectedProvider, selectedModel, setModel]);

  const selectedLabel = findSelectedLabel(
    query.data,
    selectedProvider,
    selectedModel,
  );

  const handleSelect = React.useCallback(
    (provider: AIProvider, modelId: string) => {
      setModel(provider, modelId);
      setOpen(false);
    },
    [setModel],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          disabled={disabled}
          className="gap-2"
          aria-label={`Selected model: ${selectedLabel ?? "None"}. Change model.`}
        >
          <Cpu className="size-3.5 text-brand" aria-hidden="true" />
          <span className="max-w-[140px] truncate text-xs sm:text-sm">
            {query.isLoading
              ? "Loading…"
              : selectedLabel ?? "Select a model"}
          </span>
          <ChevronDown
            className="size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-2 sm:w-[360px]"
      >
        {query.isLoading ? (
          <div className="space-y-2 p-2" aria-label="Loading models">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : query.data && query.data.groups.length > 0 ? (
          <ScrollArea className="h-[360px]">
            <div className="space-y-1 pr-1">
              {query.data.groups.map((group) => (
                <ProviderGroup
                  key={group.provider}
                  group={group}
                  selectedModel={selectedModel}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <NoProvidersState />
        )}
      </PopoverContent>
    </Popover>
  );
}
