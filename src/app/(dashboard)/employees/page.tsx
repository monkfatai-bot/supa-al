import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { EmployeeDirectory } from "@/components/employee/employee-directory";

export default async function EmployeesPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <EmployeeDirectory workspaceId={workspaceId} />;
}
