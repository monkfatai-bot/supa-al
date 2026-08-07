"use client";

/**
 * Supa AI — Prompt template picker (Phase 3 chat).
 *
 * A dialog that lets the user browse + insert prompt templates:
 *
 *   - Fetches `/api/chat/templates` (visible = own + public).
 *   - Tabs: "All", "Favorites", + one per discovered category.
 *   - Each template row shows: title, description, category badge,
 *     favorite star (toggleable for user-owned templates).
 *   - "Use template" → if the template declares variables, renders a
 *     small form to fill them; otherwise inserts the content directly.
 *     Submitting the form POSTs to `/api/chat/templates/:id/use` to
 *     render server-side + bump the usage counter, then inserts the
 *     rendered text into the composer via `onInsert`.
 *   - "Save current as template" → opens a tiny form to save the
 *     current composer text as a new user-owned template.
 *
 * The picker is rendered inside the composer and controlled via the
 * `open` / `onOpenChange` props so the composer can drive its
 * visibility.
 *
 * @module @/components/chat/prompt-template-picker
 */
import * as React from "react";
import {
  BookmarkPlus,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  useCreatePromptTemplate,
  useDeletePromptTemplate,
  usePromptTemplates,
  useRenderTemplate,
  useToggleFavoriteTemplate,
  type PromptTemplate,
  type TemplateUseResponse,
} from "@/hooks/use-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

/** Props accepted by {@link PromptTemplatePicker}. */
export interface PromptTemplatePickerProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog should close. */
  onOpenChange: (open: boolean) => void;
  /** Called with the rendered template content to insert into the
   * composer textarea. */
  onInsert: (content: string) => void;
  /** The current composer text — used by the "Save current as
   * template" flow as the default content. */
  currentText?: string;
}

/** Coerce the JSONB `variables` column into a typed descriptor array. */
interface VariableDescriptor {
  name: string;
  description?: string;
  defaultValue?: string;
}

function coerceVariables(raw: unknown): VariableDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const out: VariableDescriptor[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "name" in item) {
      const v = item as Record<string, unknown>;
      if (typeof v.name === "string") {
        const descriptor: VariableDescriptor = { name: v.name };
        if (typeof v.description === "string") {
          descriptor.description = v.description;
        }
        if (typeof v.defaultValue === "string") {
          descriptor.defaultValue = v.defaultValue;
        }
        out.push(descriptor);
      }
    }
  }
  return out;
}

/** Discover the variable names referenced in a template's content. */
function discoverVariables(template: PromptTemplate): VariableDescriptor[] {
  const declared = coerceVariables(template.variables);
  if (declared.length > 0) return declared;
  // Fallback: scan the content for `{{name}}` patterns.
  const re = /\{\{\s*([\w-]+)\s*\}\}/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(template.content)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names).map((name) => ({ name }));
}

/** Category badge color — kept neutral. */
const CATEGORY_BADGE_CLASS: Record<string, string> = {
  general:
    "border-border bg-muted text-muted-foreground",
  writing:
    "border-emerald/30 bg-emerald/10 text-emerald-700 dark:text-emerald-300",
  coding:
    "border-teal/30 bg-teal/10 text-teal-700 dark:text-teal-300",
  analysis:
    "border-amber/30 bg-amber/10 text-amber-700 dark:text-amber-300",
  creative:
    "border-rose/30 bg-rose/10 text-rose-700 dark:text-rose-300",
  business:
    "border-orange/30 bg-orange/10 text-orange-700 dark:text-orange-300",
  custom:
    "border-border bg-muted text-muted-foreground",
};

/** A single template row. */
function TemplateRow({
  template,
  onUse,
}: {
  template: PromptTemplate;
  onUse: (template: PromptTemplate) => void;
}) {
  const toggleFav = useToggleFavoriteTemplate();
  const del = useDeletePromptTemplate();
  const isOwn = template.user_id !== null;
  const variables = React.useMemo(
    () => discoverVariables(template),
    [template],
  );

  return (
    <div
      className={cn(
        "group/tmpl flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-brand/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">
              {template.title}
            </h4>
            <Badge
              variant="outline"
              className={cn(
                "h-4 px-1.5 text-[10px] capitalize",
                CATEGORY_BADGE_CLASS[template.category] ??
                  CATEGORY_BADGE_CLASS.general,
              )}
            >
              {template.category}
            </Badge>
            {template.is_public && !isOwn && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                Built-in
              </Badge>
            )}
          </div>
          {template.description && (
            <p className="text-xs text-muted-foreground">
              {template.description}
            </p>
          )}
        </div>
        {isOwn && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={
              template.is_favorite ? "Remove favorite" : "Add to favorites"
            }
            disabled={toggleFav.isPending}
            onClick={() =>
              toggleFav.mutate(
                { id: template.id, favorite: !template.is_favorite },
                {
                  onError: (err: { message?: string }) =>
                    toast.error(err.message ?? "Couldn't update favorite."),
                },
              )
            }
          >
            <Star
              className={cn(
                "size-4",
                template.is_favorite
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
          </Button>
        )}
      </div>
      <pre className="max-h-24 overflow-hidden whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
        {template.content.length > 240
          ? `${template.content.slice(0, 240)}…`
          : template.content}
      </pre>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {variables.length > 0
            ? `${variables.length} variable${variables.length === 1 ? "" : "s"}`
            : "No variables"}
          {template.usage_count > 0 && ` · used ${template.usage_count}×`}
        </span>
        <div className="flex items-center gap-1">
          {isOwn && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
              aria-label="Delete template"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(template.id, {
                  onSuccess: () => toast.success("Template deleted."),
                  onError: (err: { message?: string }) =>
                    toast.error(err.message ?? "Delete failed."),
                })
              }
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onUse(template)}
          >
            <Wand2 className="size-3.5" aria-hidden="true" />
            Use
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The variable-fill form shown when a template declares variables. */
function VariableForm({
  template,
  onCancel,
  onSubmit,
}: {
  template: PromptTemplate;
  onCancel: () => void;
  onSubmit: (variables: Record<string, string>) => Promise<void>;
}) {
  const descriptors = React.useMemo(
    () => discoverVariables(template),
    [template],
  );
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const d of descriptors) {
      init[d.name] = d.defaultValue ?? "";
    }
    return init;
  });
  const [pending, setPending] = React.useState(false);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setPending(true);
      try {
        await onSubmit(values);
      } finally {
        setPending(false);
      }
    },
    [onSubmit, values],
  );

  if (descriptors.length === 0) {
    // No variables — shouldn't reach this form, but handle gracefully.
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Fill in the template variables</p>
        <p className="text-xs text-muted-foreground">
          Variables with a default value are pre-filled — edit as needed.
        </p>
      </div>
      <div className="space-y-3">
        {descriptors.map((d) => (
          <div key={d.name} className="space-y-1">
            <Label htmlFor={`var-${d.name}`} className="text-xs">
              {d.name}
              {d.defaultValue && (
                <span className="ml-2 text-muted-foreground">
                  (default: {d.defaultValue})
                </span>
              )}
            </Label>
            {d.description && (
              <p className="text-[11px] text-muted-foreground">
                {d.description}
              </p>
            )}
            <Input
              id={`var-${d.name}`}
              value={values[d.name] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [d.name]: e.target.value }))
              }
              placeholder={d.defaultValue ?? `Enter ${d.name}`}
              disabled={pending}
            />
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          Back
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Rendering…" : "Insert template"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The "Save current as template" form. */
function SaveTemplateForm({
  defaultContent,
  onCancel,
  onSaved,
}: {
  defaultContent: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const create = useCreatePromptTemplate();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("custom");
  const [content, setContent] = React.useState(defaultContent);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedTitle = title.trim();
      const trimmedContent = content.trim();
      if (!trimmedTitle) {
        toast.error("Title is required.");
        return;
      }
      if (!trimmedContent) {
        toast.error("Content is required.");
        return;
      }
      create.mutate(
        {
          title: trimmedTitle,
          description: description.trim() || undefined,
          category,
          content: trimmedContent,
        },
        {
          onSuccess: () => {
            toast.success("Template saved.");
            onSaved();
          },
          onError: (err: { message?: string }) =>
            toast.error(err.message ?? "Couldn't save template."),
        },
      );
    },
    [category, content, create, description, onSaved, title],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <DialogHeader>
        <DialogTitle>Save as template</DialogTitle>
        <DialogDescription>
          Create a personal prompt template you can reuse later.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="tmpl-title" className="text-xs">
          Title
        </Label>
        <Input
          id="tmpl-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Code review checklist"
          disabled={create.isPending}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tmpl-desc" className="text-xs">
          Description (optional)
        </Label>
        <Input
          id="tmpl-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this template is for"
          disabled={create.isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tmpl-cat" className="text-xs">
          Category
        </Label>
        <select
          id="tmpl-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={create.isPending}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-1"
        >
          <option value="general">General</option>
          <option value="writing">Writing</option>
          <option value="coding">Coding</option>
          <option value="analysis">Analysis</option>
          <option value="creative">Creative</option>
          <option value="business">Business</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tmpl-content" className="text-xs">
          Content
        </Label>
        <Textarea
          id="tmpl-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          disabled={create.isPending}
          className="font-mono text-xs"
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={create.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Save template"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Main picker dialog. */
export function PromptTemplatePicker({
  open,
  onOpenChange,
  onInsert,
  currentText = "",
}: PromptTemplatePickerProps) {
  const [tab, setTab] = React.useState("all");
  const [activeTemplate, setActiveTemplate] =
    React.useState<PromptTemplate | null>(null);
  const [showSaveForm, setShowSaveForm] = React.useState(false);
  const renderMutation = useRenderTemplate();

  // Reset internal state when the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setActiveTemplate(null);
      setShowSaveForm(false);
      setTab("all");
    }
  }, [open]);

  const templatesQuery = usePromptTemplates({
    favorites: tab === "favorites",
    category: tab === "all" || tab === "favorites" ? undefined : tab,
  });

  const categories = React.useMemo(() => {
    if (!templatesQuery.data) return [];
    const seen = new Set<string>();
    for (const t of templatesQuery.data) {
      if (t.category) seen.add(t.category);
    }
    return Array.from(seen).sort();
  }, [templatesQuery.data]);

  const handleUse = React.useCallback(
    (template: PromptTemplate) => {
      const vars = discoverVariables(template);
      if (vars.length === 0) {
        // No variables — insert the content directly. We still POST to
        // `/use` to bump the usage counter (best-effort).
        onInsert(template.content);
        onOpenChange(false);
        toast.success("Template inserted.");
        renderMutation.mutate(
          { id: template.id, variables: {} },
          {
            onError: () => {
              /* best-effort */
            },
          },
        );
      } else {
        setActiveTemplate(template);
      }
    },
    [onInsert, onOpenChange, renderMutation],
  );

  const handleRender = React.useCallback(
    async (variables: Record<string, string>) => {
      if (!activeTemplate) return;
      try {
        const res: TemplateUseResponse = await renderMutation.mutateAsync({
          id: activeTemplate.id,
          variables,
        });
        onInsert(res.rendered);
        onOpenChange(false);
        toast.success("Template inserted.");
      } catch (err) {
        const e = err as { message?: string };
        toast.error(e.message ?? "Couldn't render template.");
      }
    },
    [activeTemplate, onInsert, onOpenChange, renderMutation],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        {showSaveForm ? (
          <SaveTemplateForm
            defaultContent={currentText}
            onCancel={() => setShowSaveForm(false)}
            onSaved={() => {
              setShowSaveForm(false);
              onOpenChange(false);
            }}
          />
        ) : activeTemplate ? (
          <VariableForm
            template={activeTemplate}
            onCancel={() => setActiveTemplate(null)}
            onSubmit={handleRender}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="size-4 text-brand" aria-hidden="true" />
                Prompt templates
              </DialogTitle>
              <DialogDescription>
                Browse reusable prompts. Click <strong>Use</strong> to insert
                one into the composer.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-2">
              <Tabs
                value={tab}
                onValueChange={setTab}
                className="flex-1 overflow-x-auto"
              >
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="favorites" className="text-xs">
                    <Star className="size-3" aria-hidden="true" />
                    Favorites
                  </TabsTrigger>
                  {categories.map((c) => (
                    <TabsTrigger
                      key={c}
                      value={c}
                      className="text-xs capitalize"
                    >
                      {c}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setShowSaveForm(true)}
                disabled={!currentText.trim()}
                title={
                  currentText.trim()
                    ? "Save the current composer text as a template"
                    : "Type something in the composer first"
                }
              >
                <BookmarkPlus className="size-3.5" aria-hidden="true" />
                Save current
              </Button>
            </div>

            <Separator />

            {templatesQuery.isLoading ? (
              <div className="space-y-2" aria-label="Loading templates">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : templatesQuery.isError ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Couldn't load templates. Please try again.
              </div>
            ) : !templatesQuery.data || templatesQuery.data.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">No templates yet</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                  {tab === "favorites"
                    ? "Star a template to see it here."
                    : "Save your current prompt as a template to reuse it later."}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-2">
                <div className="space-y-2">
                  {templatesQuery.data.map((t) => (
                    <TemplateRow
                      key={t.id}
                      template={t}
                      onUse={handleUse}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
