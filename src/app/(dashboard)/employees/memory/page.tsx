import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { EmployeeMemoryViewer } from "@/components/employee/employee-memory-viewer";

export default async function EmployeeMemoryPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <EmployeeMemoryViewer workspaceId={workspaceId} />;
}
