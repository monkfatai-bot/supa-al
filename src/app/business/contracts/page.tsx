import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { ContractEditor } from "@/components/business/contract-editor";

export default async function ContractsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ContractEditor workspaceId={workspaceId} />
    </div>
  );
}
