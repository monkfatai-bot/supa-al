import { WorkspaceHeader } from "@/components/workspace/workspace-header";
import { requireAuth } from "@/services/auth/session";

export const metadata = {
  title: "Workspace",
  description: "AI-powered collaborative workspace.",
};

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="flex h-screen flex-col">
      <WorkspaceHeader />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
