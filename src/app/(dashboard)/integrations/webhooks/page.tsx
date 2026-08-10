import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { WebhookManager } from "@/components/integration-hub/webhook-manager";

export default async function WebhooksPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <WebhookManager workspaceId={workspaceId} />
    </div>
  );
}
