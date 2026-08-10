import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { EmployeeProfile } from "@/components/employee/employee-profile";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EmployeeDetailPage({ params }: Props) {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  const { id } = await params;

  return <EmployeeProfile employeeId={id} workspaceId={workspaceId} />;
}
