import { VideoHeader } from "@/components/video/video-header";
import { requireAuth } from "@/services/auth/session";

export const metadata = {
  title: "Video Studio",
  description: "AI-powered video generation workspace.",
};

interface VideoLayoutProps {
  children: React.ReactNode;
}

export default async function VideoLayout({ children }: VideoLayoutProps) {
  await requireAuth();

  return (
    <div className="flex h-screen flex-col">
      <VideoHeader />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
