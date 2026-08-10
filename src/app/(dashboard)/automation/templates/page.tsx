import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { TemplateLibrary } from "@/components/automation/template-library";

export default async function TemplatesPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <TemplateLibrary workspaceId={workspaceId} />;
}
