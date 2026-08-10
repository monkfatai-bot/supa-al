import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { CrmCompaniesList } from "@/components/business/crm-companies-list";

export default async function CrmCompaniesPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmCompaniesList workspaceId={workspaceId} />
    </div>
  );
}
