import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { CrmContactsList } from "@/components/business/crm-contacts-list";

export default async function CrmContactsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmContactsList workspaceId={workspaceId} />
    </div>
  );
}
