import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { CrmLeadsList } from "@/components/business/crm-leads-list";

export default async function CrmLeadsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmLeadsList workspaceId={workspaceId} />
    </div>
  );
}
