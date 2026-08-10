import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { RunHistory } from "@/components/automation/run-history";

export default async function HistoryPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <RunHistory workspaceId={workspaceId} />;
}
