import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server-client';
import { requireAuth } from '@/services/auth/session';
import { VersionHistoryPanel } from '@/components/workflow-builder/version-history-panel';

export const metadata = {
  title: 'Version History | Workflow',
};

interface VersionsPageProps {
  params: Promise<{ id: string }>;
}

export default async function VersionsPage({ params }: VersionsPageProps) {
  const { id } = await params;
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Fetch workflow and verify access
  const { data: workflow, error: wfErr } = await supabase
    .from('workflows')
    .select('id, workspace_id, name')
    .eq('id', id)
    .single();

  if (wfErr || !workflow) {
    notFound();
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workflow.workspace_id)
    .eq('user_id', user.id)
    .single();

  if (!member) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-lg py-8 px-4">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Version History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {workflow.name}
        </p>
      </div>
      <VersionHistoryPanel workflowId={id} />
    </div>
  );
}
