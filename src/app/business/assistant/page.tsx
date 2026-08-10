import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { BusinessAssistantChat } from "@/components/business/business-assistant-chat";

export default async function AssistantPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <BusinessAssistantChat workspaceId={workspaceId} />
    </div>
  );
}
