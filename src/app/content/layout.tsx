import { ContentHeader } from "@/components/content/content-header";
import { requireAuth } from "@/services/auth/session";

export const metadata = {
  title: "Content Studio",
  description: "AI-powered content creation workspace.",
};

interface ContentLayoutProps {
  children: React.ReactNode;
}

export default async function ContentLayout({ children }: ContentLayoutProps) {
  const profile = await requireAuth();

  return (
    <div className="flex h-screen flex-col">
      <ContentHeader
        userName={profile.full_name}
        userEmail={profile.id}
        avatarUrl={profile.avatar_url}
      />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
