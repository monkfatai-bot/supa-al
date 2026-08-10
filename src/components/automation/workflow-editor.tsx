'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { ExecutionMode } from '@/services/automation/types';

// ── Props ────────────────────────────────────────────────────────

export interface WorkflowEditorData {
  name: string;
  description: string;
  executionMode: ExecutionMode;
  tags: string;
}

interface WorkflowEditorProps {
  initialData?: Partial<WorkflowEditorData>;
  onSubmit: (data: WorkflowEditorData) => Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
}

// ── Constants ────────────────────────────────────────────────────

const EXECUTION_MODE_OPTIONS: { value: ExecutionMode; label: string; description: string }[] = [
  { value: 'sequential', label: 'Sequential', description: 'Run actions one after another' },
  { value: 'parallel', label: 'Parallel', description: 'Run all actions simultaneously' },
  { value: 'conditional', label: 'Conditional', description: 'Branch based on conditions' },
];

// ── Component ────────────────────────────────────────────────────

export function WorkflowEditor({
  initialData,
  onSubmit,
  submitLabel = 'Save',
  isSubmitting = false,
}: WorkflowEditorProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    initialData?.executionMode ?? 'sequential',
  );
  const [tags, setTags] = useState(initialData?.tags ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ name, description, executionMode, tags });
  };

  const isValid = name.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="wf-name">Name</Label>
        <Input
          id="wf-name"
          placeholder="e.g. Lead Nurturing Workflow"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="wf-description">Description</Label>
        <Textarea
          id="wf-description"
          placeholder="Describe what this workflow does..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      {/* Execution Mode */}
      <div className="space-y-2">
        <Label>Execution Mode</Label>
        <Select
          value={executionMode}
          onValueChange={(val) => setExecutionMode(val as ExecutionMode)}
          disabled={isSubmitting}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXECUTION_MODE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex flex-col items-start">
                  <span>{opt.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {opt.description}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label htmlFor="wf-tags">Tags</Label>
        <Input
          id="wf-tags"
          placeholder="Comma-separated: crm, email, automation"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          disabled={isSubmitting}
        />
        <p className="text-xs text-muted-foreground">
          Separate multiple tags with commas
        </p>
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={!isValid || isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
