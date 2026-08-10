'use client';

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createWorkflow } from '@/services/automation/actions';
import { toast } from 'sonner';
import { WorkflowEditor, type WorkflowEditorData } from './workflow-editor';

// ── Props ────────────────────────────────────────────────────────

interface CreateWorkflowDialogProps {
  workspaceId: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function CreateWorkflowDialog({
  workspaceId,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onCreated,
}: CreateWorkflowDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: WorkflowEditorData) => {
    setSubmitting(true);
    const tags = data.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await createWorkflow(workspaceId, {
      name: data.name,
      description: data.description || undefined,
      executionMode: data.executionMode,
      tags: tags.length > 0 ? tags : undefined,
    });

    if (res.success) {
      toast.success('Workflow created successfully');
      setOpen(false);
      onCreated?.();
    } else {
      toast.error(res.message + (res.error ? `: ${res.error}` : ''));
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Workflow</DialogTitle>
        </DialogHeader>
        <WorkflowEditor
          onSubmit={handleSubmit}
          submitLabel="Create Workflow"
          isSubmitting={submitting}
        />
      </DialogContent>
    </Dialog>
  );
}
