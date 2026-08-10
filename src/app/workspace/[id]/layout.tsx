import { requireAuth } from "@/services/auth/session";
import { getWorkspace } from "@/services/workspace";
import { WorkspaceProvider } from "./workspace-context";

interface WorkspaceIdLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function WorkspaceIdLayout({ children, params }: WorkspaceIdLayoutProps) {
  await requireAuth();
  const { id } = await params;
  const result = await getWorkspace(id);

  if (!result.success || !result.workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Access Denied</p>
      </div>
    );
  }

  return <WorkspaceProvider workspaceId={id}>{children}</WorkspaceProvider>;
}