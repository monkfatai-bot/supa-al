import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { SchedulerManager } from "@/components/automation/scheduler-manager";

export default async function ScheduledPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <SchedulerManager workspaceId={workspaceId} />;
}
