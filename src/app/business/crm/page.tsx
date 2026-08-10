import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { CrmPipeline } from "@/components/business/crm-pipeline";

export default async function CrmPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmPipeline workspaceId={workspaceId} />
    </div>
  );
}
