import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { EmployeeManager } from "@/components/employee/employee-manager";

export default async function EmployeeManagePage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <EmployeeManager workspaceId={workspaceId} />;
}
