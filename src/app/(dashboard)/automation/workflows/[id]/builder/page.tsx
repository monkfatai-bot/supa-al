import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server-client'
import { requireAuth } from '@/services/auth/session'
import type { Node, Edge } from '@xyflow/react'
import { WorkflowBuilder } from '@/components/workflow-builder/workflow-builder'

export const metadata = {
  title: 'Workflow Builder | Automation',
}

interface BuilderPageProps {
  params: Promise<{ id: string }>
}

export default async function BuilderPage({ params }: BuilderPageProps) {
  const { id } = await params
  const user = await requireAuth()
  const supabase = await createServerSupabaseClient()

  // Fetch workflow with workspace access check
  const { data: workflow, error: wfErr } = await supabase
    .from('workflows')
    .select('id, workspace_id, name, description, status, created_by')
    .eq('id', id)
    .single()

  if (wfErr || !workflow) {
    notFound()
  }

  // Verify workspace membership
  const { data: member } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workflow.workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    notFound()
  }

  // Fetch nodes ordered by step_position
  const { data: dbNodes } = await supabase
    .from('workflow_nodes')
    .select('*')
    .eq('workflow_id', id)
    .order('step_position', { ascending: true })

  // Fetch edges
  const { data: dbEdges } = await supabase
    .from('workflow_edges')
    .select('*')
    .eq('workflow_id', id)

  // Convert DB rows to ReactFlow format
  const nodes: Node[] = (dbNodes ?? []).map((n) => ({
    id: n.id,
    type: 'workflow',
    position: { x: n.position_x, y: n.position_y },
    data: {
      label: n.label,
      nodeCategory: n.node_category,
      nodeType: n.node_type,
      icon: (n.data as Record<string, unknown>)?.icon ?? 'Variable',
      color: (n.data as Record<string, unknown>)?.color ?? 'zinc',
      description: n.description,
      isEnabled: n.is_enabled,
      hasBreakpoint: n.has_breakpoint,
      config: n.config as Record<string, unknown>,
    },
  }))

  const edges: Edge[] = (dbEdges ?? []).map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_handle || undefined,
    targetHandle: e.target_handle || undefined,
    type: 'smoothstep',
  }))

  return (
    <div className="h-screen w-full overflow-hidden">
      <WorkflowBuilder
        workflowId={workflow.id}
        workflowName={workflow.name}
        initialNodes={nodes}
        initialEdges={edges}
      />
    </div>
  )
}
