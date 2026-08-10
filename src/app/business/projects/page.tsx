import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { ProjectList } from "@/components/business/project-list";

export default async function ProjectsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ProjectList workspaceId={workspaceId} />
    </div>
  );
}
