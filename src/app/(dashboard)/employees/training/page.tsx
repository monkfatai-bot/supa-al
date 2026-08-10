import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { EmployeeTrainingCenter } from "@/components/employee/employee-training-center";

export default async function EmployeeTrainingPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <EmployeeTrainingCenter workspaceId={workspaceId} />;
}
