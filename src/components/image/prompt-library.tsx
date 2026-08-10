"use client";

import { useState, FormEvent } from "react";
import { Bookmark, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { savePrompt, deletePrompt } from "@/services/image/actions";
import type { ImagePrompt } from "@/types/generated/database";

interface PromptLibraryProps {
  prompts: ImagePrompt[];
  onUse: (prompt: string) => void;
  onRefresh: () => void;
}

export function PromptLibrary({ prompts, onUse, onRefresh }: PromptLibraryProps) {
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveText, setSaveText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    await savePrompt(saveName, saveText);
    setSaveName("");
    setSaveText("");
    setIsSaveOpen(false);
    setIsSaving(false);
    onRefresh();
  }

  async function handleDelete(id: string) {
    await deletePrompt(id);
    onRefresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Saved Prompts</h3>
        <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7">
              <Plus className="mr-1 h-3 w-3" />
              Save
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Prompt</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-3">
              <Input
                placeholder="Name (optional)"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter the prompt to save..."
                value={saveText}
                onChange={(e) => setSaveText(e.target.value)}
                required
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsSaveOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || !saveText.trim()}>
                  <Bookmark className="mr-1 h-3 w-3" />
                  Save
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="max-h-[300px]">
        {prompts.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No saved prompts yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {prompts.map((p) => (
              <div
                key={p.id}
                className="group flex items-start gap-2 rounded-md border p-2"
              >
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => onUse(p.prompt)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onUse(p.prompt);
                  }}
                >
                  {p.name && p.name !== p.prompt.slice(0, 60) && (
                    <p className="text-xs font-medium">{p.name}</p>
                  )}
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {p.prompt}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={() => handleDelete(p.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}