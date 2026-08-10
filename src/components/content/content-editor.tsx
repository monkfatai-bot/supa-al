"use client";

import { useState } from "react";
import { Save, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateContent } from "@/services/content/actions";
import type { AiContent } from "@/services/content";

interface ContentEditorProps {
  content: AiContent;
  onSave: (updated: AiContent) => void;
  onCancel: () => void;
}

export function ContentEditor({
  content: initialContent,
  onSave,
  onCancel,
}: ContentEditorProps) {
  const [value, setValue] = useState(initialContent.generated_content);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    const result = await updateContent(initialContent.id, value);
    if (result.success) {
      onSave({ ...initialContent, generated_content: value });
    }
    setIsSaving(false);
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={16}
        className="min-h-[300px] max-h-[600px] resize-y font-sans text-sm leading-relaxed"
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          <X className="mr-1 h-4 w-4" />
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || value === initialContent.generated_content}>
          {isSaving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}