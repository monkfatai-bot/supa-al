import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { ProposalEditor } from "@/components/business/proposal-editor";

export default async function ProposalsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ProposalEditor workspaceId={workspaceId} />
    </div>
  );
}
