import { requireAuth } from "@/services/auth/session";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { IntegrationsSubNav } from "@/components/integration-hub/integrations-sub-nav";

export default async function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAuth();

  return (
    <SidebarProvider>
      <AppSidebar userName={profile.full_name} avatarUrl={profile.avatar_url} />
      <SidebarInset>
        <IntegrationsSubNav />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
