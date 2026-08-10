import { ImageHeader } from "@/components/image/image-header";
import { requireAuth } from "@/services/auth/session";
import { getAuthUser } from "@/services/auth/session";

export const metadata = {
  title: "Image Studio",
  description: "AI-powered image generation workspace.",
};

interface ImageLayoutProps {
  children: React.ReactNode;
}

export default async function ImageLayout({ children }: ImageLayoutProps) {
  const profile = await requireAuth();
  const authUser = await getAuthUser();

  return (
    <div className="flex h-screen flex-col">
      <ImageHeader
        userName={profile.full_name}
        userEmail={authUser?.email ?? null}
        avatarUrl={profile.avatar_url}
      />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
