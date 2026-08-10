import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { ReceiptsManager } from "@/components/business/receipts-manager";

export default async function ReceiptsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ReceiptsManager workspaceId={workspaceId} />
    </div>
  );
}
