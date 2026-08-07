import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getOrchestrator } from "@/lib/runtime";
import { validateInput } from "@/lib/validation";
import { orchestrateSchema } from "@/lib/validation/runtime";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:manage");
    const input = validateInput(orchestrateSchema, await req.json());
    const orchestrator = getOrchestrator();
    const result = await orchestrator.createPlan({
      workspace_id: input.workspace_id,
      user_id: user.id,
      supervisor_agent_id: input.supervisor_agent_id,
      worker_agent_ids: input.worker_agent_ids,
      tasks: input.tasks.map((t) => ({
        name: t.name,
        assigned_agent_id: t.assigned_agent_id,
        dependencies: t.dependencies,
        priority: t.priority,
        task_type: t.task_type,
        payload: t.payload,
      })),
      execution_mode: input.execution_mode,
      shared_context: input.shared_context,
    });
    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
